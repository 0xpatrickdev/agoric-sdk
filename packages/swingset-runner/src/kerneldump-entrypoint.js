#!/usr/bin/env node

/**
 * Simple boilerplate program providing linkage to launch an application written
 * using modules within the as yet not-entirely-ESM-supporting version of
 * NodeJS.
 */

// Now do lockdown.
import '@endo/init';
import { main } from './kerneldump.js';

main();
