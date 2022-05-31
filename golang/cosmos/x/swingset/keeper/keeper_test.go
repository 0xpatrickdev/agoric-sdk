package keeper

import (
	"bytes"
	"encoding/base64"
	"testing"

	"github.com/Agoric/agoric-sdk/golang/cosmos/app/params"
	agoric "github.com/Agoric/agoric-sdk/golang/cosmos/types"
	"github.com/Agoric/agoric-sdk/golang/cosmos/x/swingset/types"

	"github.com/cosmos/cosmos-sdk/store"
	storetypes "github.com/cosmos/cosmos-sdk/store/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	paramskeeper "github.com/cosmos/cosmos-sdk/x/params/keeper"
	paramstypes "github.com/cosmos/cosmos-sdk/x/params/types"

	"github.com/tendermint/tendermint/libs/log"
	tmproto "github.com/tendermint/tendermint/proto/tendermint/types"
	dbm "github.com/tendermint/tm-db"
)

var (
	paramsStoreKey   = storetypes.NewKVStoreKey(paramstypes.StoreKey)
	paramsTKey       = storetypes.NewTransientStoreKey(paramstypes.TStoreKey)
	swingsetStoreKey = storetypes.NewKVStoreKey(types.StoreKey)
)

func Test_Key_Encoding(t *testing.T) {
	tests := []struct {
		name   string
		keyStr string
		key    []byte
	}{
		{
			name:   "empty key matches prefix",
			keyStr: "",
			key:    keyPrefix,
		},
		{
			name:   "empty key string (actual)",
			keyStr: "",
			key:    []byte{':'},
		},
		{
			name:   "some key string",
			keyStr: "some",
			key:    []byte{':', 's', 'o', 'm', 'e'},
		},
		{
			name:   "key prefix immutable",
			keyStr: "",
			key:    keyPrefix,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if key := stringToKey(tt.keyStr); !bytes.Equal(key, tt.key) {
				t.Errorf("stringToKey(%q) = %v, want %v", tt.keyStr, key, tt.key)
			}
			if keyStr := keyToString(tt.key); keyStr != tt.keyStr {
				t.Errorf("keyToString(%v) = %q, want %q", tt.key, keyStr, tt.keyStr)
			}
		})
	}
}

type testKit struct {
	ctx            sdk.Context
	swingsetKeeper Keeper
}

func makeTestKit() testKit {
	encodingConfig := params.MakeEncodingConfig()
	types.RegisterInterfaces(encodingConfig.InterfaceRegistry)
	cdc := encodingConfig.Marshaler

	pk := paramskeeper.NewKeeper(cdc, encodingConfig.Amino, paramsStoreKey, paramsTKey)
	swingsetSpace := pk.Subspace(types.ModuleName)

	// TODO: Flesh out with more than nil if necessary.
	keeper := NewKeeper(cdc, swingsetStoreKey, swingsetSpace, nil, nil, "nil", nil)

	db := dbm.NewMemDB()
	ms := store.NewCommitMultiStore(db)
	ms.MountStoreWithDB(swingsetStoreKey, sdk.StoreTypeIAVL, db)
	err := ms.LoadLatestVersion()
	if err != nil {
		panic(err)
	}
	ctx := sdk.NewContext(ms, tmproto.Header{}, false, log.NewNopLogger())

	return testKit{ctx, keeper}
}

func keysEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func b64e(s string) []byte {
	return []byte(base64.StdEncoding.EncodeToString([]byte(s)))
}

func b64d(b []byte) ([]byte, error) {
	return base64.StdEncoding.DecodeString(string(b))
}

type attrValues map[string][]byte

func checkEvents(t *testing.T, ctx sdk.Context, expectedEvents map[string]attrValues) map[string]attrValues {
	eventValues := make(map[string]attrValues)
	for _, event := range ctx.EventManager().ABCIEvents() {
		expectedAttrs, ok := expectedEvents[event.Type]
		if !ok {
			t.Errorf("got unexpected event %s", event.Type)
		}
		delete(expectedEvents, event.Type)

		attrValues := make(map[string][]byte)
		eventValues[event.Type] = attrValues
		for _, attr := range event.Attributes {
			expectedValue, ok := expectedAttrs[string(attr.Key)]
			if !ok {
				t.Errorf("got unexpected attribute %s %s", event.Type, attr.Key)
			}
			delete(expectedAttrs, string(attr.Key))
			if !bytes.Equal(attr.Value, expectedValue) {
				t.Errorf("got %q %q %q, want %q", event.Type, string(attr.Key), string(attr.Value), expectedValue)
			}
			attrValues[string(attr.Key)] = attr.Value
		}

		if len(expectedAttrs) > 0 {
			t.Errorf("missing expected %s attributes: %v", event.Type, expectedAttrs)
		}
	}
	if len(expectedEvents) > 0 {
		t.Errorf("missing expected events: %v", expectedEvents)
	}

	return eventValues
}

func TestStorage(t *testing.T) {
	testKit := makeTestKit()
	ctx, keeper := testKit.ctx, testKit.swingsetKeeper

	// Test that we can store and retrieve a value.
	initValue := "initValue\xc3\x28"
	if got := []byte(initValue); got[len(got)-1] != 0x28 {
		t.Errorf("expected last byte to be 0x28, got %x", got[len(got)-1])
	}
	keeper.SetStorageAndNotify(ctx, "inited", initValue)
	if got := keeper.GetStorage(ctx, "inited"); got != initValue {
		t.Errorf("got %q, want %q", got, initValue)
	}

	// Check that our new state update coordinates work.
	expectedEvents := map[string]attrValues{
		types.EventTypeStorage: {
			types.AttributeKeyPath:  []byte("inited"),
			types.AttributeKeyValue: []byte(initValue),
		},
		agoric.EventTypeStateChange: {
			agoric.AttributeKeyStoreName:     []byte(keeper.storeKey.Name()),
			agoric.AttributeKeyStoreSubkey:   b64e("swingset/data:inited"),
			agoric.AttributeKeyUnprovedValue: b64e(initValue),
		},
	}
	eventValues := checkEvents(t, ctx, expectedEvents)

	// Verify that the storage is obtainable from any event.
	for eventType, attrValues := range eventValues {
		switch eventType {
		case types.EventTypeStorage:
			path := string(attrValues[types.AttributeKeyPath])
			value := string(attrValues[types.AttributeKeyValue])
			if got := keeper.GetStorage(ctx, path); got != value {
				t.Errorf("got %q %q, want %q", path, got, value)
			}
		case agoric.EventTypeStateChange:
			dataStore := ctx.KVStore(keeper.storeKey)
			subkey, err := b64d(attrValues[agoric.AttributeKeyStoreSubkey])
			if err != nil {
				t.Fatal(err)
			}
			unprovedValue, err := b64d(attrValues[agoric.AttributeKeyUnprovedValue])
			if err != nil {
				t.Fatal(err)
			}
			if got := dataStore.Get(subkey); !bytes.Equal(got, unprovedValue) {
				t.Errorf("got %q, want %q", got, unprovedValue)
			}
		}
	}

	// Test that unknown keys return empty string.
	if got := keeper.GetStorage(ctx, "unknown"); got != "" {
		t.Errorf("got %q, want empty string", got)
	}

	// Check that our keys are updated as expected.
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"inited"}) {
		t.Errorf("got %q keys, want [inited]", got.Keys)
	}

	keeper.SetStorage(ctx, "key1", "value1")
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"inited", "key1"}) {
		t.Errorf("got %q keys, want [inited,key1]", got.Keys)
	}

	// Check alphabetical.
	keeper.SetStorage(ctx, "alpha2", "value2")
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"alpha2", "inited", "key1"}) {
		t.Errorf("got %q keys, want [alpha2,inited,key1]", got.Keys)
	}

	keeper.SetStorage(ctx, "beta3", "value3")
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"alpha2", "beta3", "inited", "key1"}) {
		t.Errorf("got %q keys, want [alpha2,beta3,inited,key1]", got.Keys)
	}

	if got := keeper.GetKeys(ctx, "nonexistent"); !keysEqual(got.Keys, []string{}) {
		t.Errorf("got %q keys, want []", got.Keys)
	}

	// Check adding children.
	keeper.SetStorage(ctx, "key1.child1", "value1child")
	if got := keeper.GetStorage(ctx, "key1.child1"); got != "value1child" {
		t.Errorf("got %q, want %q", got, "value1child")
	}

	if got := keeper.GetKeys(ctx, "key1"); !keysEqual(got.Keys, []string{"child1"}) {
		t.Errorf("got %q keys, want [child1]", got.Keys)
	}

	// Add a grandchild.
	keeper.SetStorage(ctx, "key1.child1.grandchild1", "value1grandchild")
	if got := keeper.GetStorage(ctx, "key1.child1.grandchild1"); got != "value1grandchild" {
		t.Errorf("got %q, want %q", got, "value1grandchild")
	}

	if got := keeper.GetKeys(ctx, "key1.child1"); !keysEqual(got.Keys, []string{"grandchild1"}) {
		t.Errorf("got %q keys, want [grandchild1]", got.Keys)
	}

	// Delete the child's contents.
	keeper.SetStorage(ctx, "key1.child1", "")
	if got := keeper.GetKeys(ctx, "key1"); !keysEqual(got.Keys, []string{"child1"}) {
		t.Errorf("got %q keys, want [child1]", got.Keys)
	}

	if got := keeper.GetKeys(ctx, "key1.child1"); !keysEqual(got.Keys, []string{"grandchild1"}) {
		t.Errorf("got %q keys, want [grandchild1]", got.Keys)
	}

	// Delete the grandchild's contents.
	keeper.SetStorage(ctx, "key1.child1.grandchild1", "")
	if got := keeper.GetKeys(ctx, "key1.child1"); !keysEqual(got.Keys, []string{}) {
		t.Errorf("got %q keys, want []", got.Keys)
	}
	// Removing that node rolls up into the parent.
	if got := keeper.GetKeys(ctx, "key1"); !keysEqual(got.Keys, []string{}) {
		t.Errorf("got %q keys, want []", got.Keys)
	}

	// See about deleting the parent.
	keeper.SetStorage(ctx, "key1", "")
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"alpha2", "beta3", "inited"}) {
		t.Errorf("got %q keys, want [alpha2,beta3,inited]", got.Keys)
	}

	// Do a deep set.
	keeper.SetStorage(ctx, "key2.child2.grandchild2", "value2grandchild")
	if got := keeper.GetKeys(ctx, ""); !keysEqual(got.Keys, []string{"alpha2", "beta3", "inited", "key2"}) {
		t.Errorf("got %q keys, want [alpha2,beta3,inited,key2]", got.Keys)
	}
	if got := keeper.GetKeys(ctx, "key2.child2"); !keysEqual(got.Keys, []string{"grandchild2"}) {
		t.Errorf("got %q keys, want [grandchild2]", got.Keys)
	}
	if got := keeper.GetKeys(ctx, "key2"); !keysEqual(got.Keys, []string{"child2"}) {
		t.Errorf("got %q keys, want [child2]", got.Keys)
	}

	// Do another deep set.
	keeper.SetStorage(ctx, "key2.child2.grandchild2a", "value2grandchilda")
	if got := keeper.GetKeys(ctx, "key2.child2"); !keysEqual(got.Keys, []string{"grandchild2", "grandchild2a"}) {
		t.Errorf("got %q keys, want [grandchild2,grandchild2a]", got.Keys)
	}
}
