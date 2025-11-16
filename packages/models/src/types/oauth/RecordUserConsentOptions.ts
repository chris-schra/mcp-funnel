export interface RecordUserConsentOptions {
  /**
   * Persist consent beyond the default TTL. Implementations may map this to a longer
   * expiration window or an indefinite consent depending on storage capabilities.
   */
  remember?: boolean;
  /** Custom TTL in seconds for this consent decision */
  ttlSeconds?: number;
  /** When the consent was captured – defaults to current timestamp */
  consentedAt?: number;
}
