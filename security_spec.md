# Security Specification: PakFound Trust Network

## Data Invariants
1. A Quest must have a valid `ownerId` matching the creator's UID.
2. A Message must belong to a Quest and the sender must be a participant (owner or helper).
3. A Reward Claim can only be created by a Helper.
4. User profiles can only be modified by the owner (except certain system fields).

## The Dirty Dozen (Attack Payloads)
1. **Identity Spoofing**: Attempt to create a Quest with someone else's UID.
2. **Resource Poisoning**: Use a 1MB string as a Quest ID.
3. **Privilege Escalation**: Attempt to set `isVerified: true` on own user profile via client SDK.
4. **Shadow Field Injection**: Adding `isAdmin: true` to a user document.
5. **Update Gap**: Modifying a finished Quest's reward amount.
6. **Relational Break**: Creating a message for a quest that doesn't exist.
7. **PII Leak**: Reading another user's private data (if it existed).
8. **Orphaned Write**: Creating a claim for a non-existent quest.
9. **Spam Attack**: Flooding notifications without rate limit checks.
10. **State Shortcut**: Moving a claim from PENDING to APPROVED directly as a helper.
11. **Negative Reward**: Setting `rewardAmount` to -1000.
12. **Unauthorized List**: Listing all users in the system.

## Test Runner (Logic)
All write/update operations must pass `isValid[Entity]` and `isOwner` where applicable.
Terminal states like `COMPLETED` quests are locked.
