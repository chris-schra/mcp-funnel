/**
 * Deep cloning utility using rfdc (Really Fast Deep Clone)
 */

import rfdc from 'rfdc';

/**
 * Creates a deep clone of the given value
 * Uses rfdc for performance and reliability
 */
export const deepClone = rfdc();

/**
 * Creates a deep clone with support for circular references
 * Use this when the data might contain circular references
 */
export const deepCloneWithCircles = rfdc({ circles: true });
