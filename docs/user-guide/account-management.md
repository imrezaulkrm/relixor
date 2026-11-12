# Profile & Account Security

## Profile

Open **Profile** from the user menu. You can update your display name, email (subject to uniqueness) and avatar/icon URL where supported. Role and active status are administrator-controlled and cannot be self-changed.

Changing your email changes your login identifier; use a valid address you control.

## Change password

1. **Profile → Security → Change password**.
2. Enter current password and a new password (minimum 8 characters; use 12+ and a manager).
3. Submit.

The server verifies the current password, hashes the new one with bcrypt, increments `tokenVersion`, and revokes other sessions. Your current session may also be invalidated depending on the flow; sign in again if prompted. Never reuse the administrator seed password.

## Active sessions

**Profile → Sessions** lists active sessions with device/user-agent, IP, creation and last-use times. Revoke a single session or all other sessions. Revoking takes effect on the next request.

Use this after losing a device or suspecting token theft. If you suspect the JWT secret itself is compromised, an administrator must rotate `JWT_SECRET`, which logs out everyone.

## Login and activity history

**Profile → Activity** shows your recent login events (success/failure), logouts and security-relevant actions. Failed logins from unknown IPs should be reported. Administrators can view any user's sessions/activity from **Users**.

## Administrator-issued password reset

There is **no email delivery**. An administrator opens **Users → user → Security → Reset password**, generates a single-use token, and gives it to the user over a secure channel.

- Token is stored hashed, expires after 60 minutes, and can be used once.
- The plaintext token is displayed **once** to the administrator and never logged.
- The user submits token + new password at the reset screen/`POST /auth/password-reset`.
- Reset revokes sessions and increments `tokenVersion`.
- The administrator must not paste the token into chat/tickets; use a password manager or secure handoff.

## Account deactivation and recovery

- Deactivation blocks login and invalidates sessions immediately; data and audit history remain.
- Reactivation restores login but does not restore revoked sessions; the user signs in again.
- Deleted users are removed; their audit entries remain with a null actor reference where applicable.
- There is no self-service account deletion or self-service email change verification.

## Security recommendations

- Use a unique password and a password manager; enable TLS everywhere.
- Review sessions monthly and after role changes.
- Do not share administrator accounts; create named admins.
- API tokens are for machines, not people. Never paste tokens into the browser console or URLs.
- Log out on shared devices.
- Report suspicious audit/login activity to the administrator.

## Troubleshooting

| Issue | Fix |
|---|---|
| Current password rejected | Use the exact current password; resets require admin token |
| Reset token invalid | Expired/used; request a new one |
| Logged out after password change | Expected; sign in with the new password |
| Session still listed | It may be expired but not yet reconciled; revoke explicitly |
| Cannot change role/email | Role is admin-only; email may already exist |

## Related

- [Administrator manual](/docs/user-guide/admin-manual)
- [Security](/docs/security/index)
- [User management](/docs/user-guide/user-management)
