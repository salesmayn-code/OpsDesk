// Integration tests exercise the self-registration flow against the seeded
// local database, so the feature flag is enabled for the whole project.
process.env.ALLOW_SELF_REGISTRATION = 'true';
