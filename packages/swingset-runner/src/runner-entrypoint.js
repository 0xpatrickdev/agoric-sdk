#!/usr/bin/env node

// #!/usr/bin/env -S node --inspect-brk

/**
 * Simple boilerplate program providing linkage to launch an application written using modules within the
 * as yet not-entirely-ESM-supporting version of NodeJS.
 */

import '@endo/init/pre-bundle-source.js';

// Now do lockdown.
import '@endo/init';
import { main } from './main.js';

main();
