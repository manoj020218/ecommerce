# Phase 1 Settings Regression Checklist

## API behavior

- [ ] `GET /api/admin/settings` returns all settings sections with metadata.
- [ ] `PUT /api/admin/settings/store-profile` updates and persists store profile fields.
- [ ] `PUT /api/admin/settings/branding` updates brand colors/logo URLs.
- [ ] `PUT /api/admin/settings/seo-defaults` updates home SEO defaults.
- [ ] `PUT /api/admin/settings/contact-information` updates public contact data.
- [ ] `PUT /api/admin/settings/custom-code` is blocked for non-super-admin.
- [ ] `PUT /api/admin/settings/custom-code` works for `super_admin`.

## Upload behavior

- [ ] Branding image upload returns a usable public URL.
- [ ] Uploaded image is reachable under `/static/uploads`.
- [ ] Non-image upload is rejected.

## Public/Front API behavior

- [ ] `GET /api/settings/bootstrap` returns only public-safe fields.
- [ ] Public store-profile response does not expose bank/account/IFSC/UPI.
- [ ] `GET /api/settings/seo-defaults` returns values used by front home page.
- [ ] `GET /api/settings/contact-information` returns footer/contact fields.

## Logging and audit

- [ ] Settings updates append entries in settings audit log.
- [ ] Updated metadata captures `updatedAt` and `updatedBy`.
