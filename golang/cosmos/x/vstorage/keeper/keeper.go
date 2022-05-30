package keeper

import (
	"bytes"
	"strings"

	sdk "github.com/cosmos/cosmos-sdk/types"
	db "github.com/tendermint/tm-db"

	agoric "github.com/Agoric/agoric-sdk/golang/cosmos/types"
	"github.com/Agoric/agoric-sdk/golang/cosmos/x/vstorage/types"
)

// Keeper maintains the link to data storage and exposes getter/setter methods
// for the various parts of the state machine
type Keeper struct {
	storeKey sdk.StoreKey
}

func NewKeeper(storeKey sdk.StoreKey) Keeper {
	return Keeper{storeKey}
}

// ExportStorage fetches all storage
func (k Keeper) ExportStorage(ctx sdk.Context) []*types.DataEntry {
	store := ctx.KVStore(k.storeKey)

	iterator := sdk.KVStorePrefixIterator(store, nil)

	exported := []*types.DataEntry{}
	defer iterator.Close()
	for ; iterator.Valid(); iterator.Next() {
		path := types.EncodedKeyToPath(iterator.Key())
		value := string(bytes.TrimPrefix(iterator.Value(), types.EncodedDataPrefix))
		if len(value) == 0 {
			continue
		}
		entry := types.DataEntry{Path: path, Value: value}
		exported = append(exported, &entry)
	}
	return exported
}

func (k Keeper) ImportStorage(ctx sdk.Context, entries []*types.DataEntry) {
	for _, entry := range entries {
		// This set does the bookkeeping for us in case the entries aren't a
		// complete tree.
		k.SetStorage(ctx, entry.Path, entry.Value)
	}
}

// GetData gets generic storage
func (k Keeper) GetData(ctx sdk.Context, path string) string {
	//fmt.Printf("GetData(%s)\n", path);
	store := ctx.KVStore(k.storeKey)
	encodedKey := types.PathToEncodedKey(path)
	bz := bytes.TrimPrefix(store.Get(encodedKey), types.EncodedDataPrefix)
	value := string(bz)
	return value
}

func (k Keeper) getKeyIterator(ctx sdk.Context, path string) db.Iterator {
	store := ctx.KVStore(k.storeKey)
	keyPrefix := types.PathToChildrenPrefix(path)

	return sdk.KVStorePrefixIterator(store, keyPrefix)
}

// GetKeys gets all vstorage child keys at a given path
func (k Keeper) GetKeys(ctx sdk.Context, path string) *types.Keys {
	iterator := k.getKeyIterator(ctx, path)

	var keys types.Keys
	keys.Keys = []string{}
	defer iterator.Close()
	for ; iterator.Valid(); iterator.Next() {
		parts := strings.Split(types.EncodedKeyToPath(iterator.Key()), types.PathSeparator)
		keyStr := parts[len(parts)-1]
		keys.Keys = append(keys.Keys, keyStr)
	}
	return &keys
}

// HasStorage tells if a given path has data.
func (k Keeper) HasStorage(ctx sdk.Context, path string) bool {
	return k.GetData(ctx, path) != ""
}

func (k Keeper) Exists(ctx sdk.Context, path string) bool {
	store := ctx.KVStore(k.storeKey)
	encodedKey := types.PathToEncodedKey(path)

	// Check if we have a path entry.
	return store.Has(encodedKey)
}

// HasKeys tells if a given path has child keys.
func (k Keeper) HasKeys(ctx sdk.Context, path string) bool {
	// Check if we have children.
	iterator := k.getKeyIterator(ctx, path)
	defer iterator.Close()
	return iterator.Valid()
}

func (k Keeper) LegacySetStorageAndNotify(ctx sdk.Context, path, value string) {
	k.SetStorage(ctx, path, value)

	// Emit the legacy change event.
	ctx.EventManager().EmitEvent(
		types.NewLegacyStorageEvent(path, value),
	)
}

func (k Keeper) SetStorageAndNotify(ctx sdk.Context, path, value string) {
	k.LegacySetStorageAndNotify(ctx, path, value)

	// Emit the new state change event.
	ctx.EventManager().EmitEvent(
		agoric.NewStateChangeEvent(
			k.GetStoreName(),
			k.PathToEncodedKey(path),
			[]byte(value),
		),
	)
}

// SetStorage sets the data value for a path.
//
// Maintains the invariant: path entries exist if and only if self or some
// descendant has non-empty storage
func (k Keeper) SetStorage(ctx sdk.Context, path, value string) {
	store := ctx.KVStore(k.storeKey)
	encodedKey := types.PathToEncodedKey(path)

	if value == "" && !k.HasKeys(ctx, path) {
		// We have no children, can delete.
		store.Delete(encodedKey)
	} else {
		// Update the value.
		bz := bytes.Join([][]byte{types.EncodedDataPrefix, []byte(value)}, []byte{})
		store.Set(encodedKey, bz)
	}

	// Update our other parent keys.
	pathComponents := strings.Split(path, types.PathSeparator)
	for i := len(pathComponents) - 1; i >= 0; i-- {
		ancestor := strings.Join(pathComponents[0:i], types.PathSeparator)

		// Decide if we need to add or remove the ancestor.
		if value == "" {
			if k.HasStorage(ctx, ancestor) || k.HasKeys(ctx, ancestor) {
				// If the key is needed, skip out.
				return
			}
			// Remove the key.
			encodedKey = types.PathToEncodedKey(ancestor)
			store.Delete(encodedKey)
		} else if i < len(pathComponents) && k.Exists(ctx, ancestor) {
			// The key is present, so we can skip out.
			return
		} else {
			// Add the key as an placeholder value.
			encodedKey = types.PathToEncodedKey(ancestor)
			store.Set(encodedKey, types.EncodedDataPrefix)
		}
	}
}

func (k Keeper) PathToEncodedKey(path string) []byte {
	return types.PathToEncodedKey(path)
}

func (k Keeper) GetStoreName() string {
	return k.storeKey.Name()
}
