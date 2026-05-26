# Phase 2 Staff Module Regression Checklist

- [ ] Admin with `staff.view` can list staff users.
- [ ] Admin with `staff.create` can create staff user with permission group.
- [ ] Staff creation rejects duplicate email.
- [ ] Staff without `staff.edit_permissions` cannot edit staff user/group assignment.
- [ ] Staff password update hashes password and logs activity.
