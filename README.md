# Access Hub

Access Hub là nơi để một nhóm làm việc chung trên các dự án mã nguồn.

- Mỗi dự án có một hoặc nhiều **chủ sở hữu** và các **thành viên**.
- Chủ sở hữu quản lý toàn bộ dự án và có thể mời thêm người, nâng thành viên lên làm chủ sở hữu.
- Thành viên xem được dự án và đóng góp bằng cách gửi phần chỉnh sửa của mình lên. Phần này chỉ được đưa vào dự án chính sau khi chủ sở hữu xem và đồng ý.
- Nhiều người có thể đóng góp cùng một lúc mà không ảnh hưởng đến nhau.

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Below is the whole plan explained again. Each part starts with what the user sees and does, then lists the rules the system must follow, then explains how we build it. I left out code, as you asked. I also mark which edge cases from direction.md each part handles, so you can see that the list of 14 is fully covered.

---

# 0. The big picture

## What the end user sees

Access Hub is a small, self-hosted GitHub. A team uses it to work on code together.

A normal day looks like this:

1. **Alice** signs up with email and password and creates a project called "billing-service". She is now its **Owner**.
2. Alice adds her coworker **Bob** by email. Bob is a **Member**.
3. Both of them create a **credential** in Access Hub. It works like a personal password for git. They use it with normal `git clone` and `git push` from their own computer. No special tools are needed.
4. Alice pushes the first code to the main branch.
5. Bob can't push to main. He works on his own branch, pushes it, then clicks "open contribution", which is our version of a pull request.
6. Alice looks at the changes (the diff) and approves. The server merges Bob's branch into main for real. Or she rejects it.
7. Every time a credential is used, successfully or not, Access Hub records it. If a credential leaks, an Owner can revoke it and it stops working immediately.

Commands supported once the plan is done: only commands that talk to the server matter. Local commands like commit, branch, merge and log never reach us.

Command	Credential needed	Notes
git clone	READ or READ_WRITE	
git fetch / git pull	READ or READ_WRITE	
git ls-remote	READ or READ_WRITE	Lists the server's branches
git push (new or existing branch)	READ_WRITE	Main is limited to Owners
git push --force	READ_WRITE	Main is limited to Owners
git push --delete (delete a branch)	READ_WRITE	Main is limited to Owners
git push of tags	READ_WRITE	The hook only protects the default branch, so any member with write can push tags
Merging into main is not a git command the user runs. It happens on the server when an Owner approves a contribution through our REST API.

## The main rule behind everything

**Permission is always checked live, at the moment of the request.** Nothing is trusted because it was true earlier. A role, a membership or a credential's state is read from the database every time. This one rule handles several of the hardest edge cases: the zombie key (7), the demoted employee (11) and the revoke race (9).

---

# 1. Users and login

## What the end user sees

- Sign up with email and password, then log in.
- After login, the web dashboard (REST API) knows who you are.
- There is no global "admin" role. Your power depends only on which projects you belong to and your role in each one.

## Requirements

- Passwords are never stored in readable form.
- A login session (JWT) is short-lived and contains no sensitive data.
- If a user is deleted, their session stops working immediately, even though their token hasn't expired yet.
- Every endpoint requires login unless it is clearly marked as public.

## Solution (already built)

- Passwords are hashed with bcrypt. bcrypt is slow on purpose, which makes guessing passwords expensive.
- A **global** JWT guard protects every route by default. A `@Public()` marker opts a route out. Secure by default means a forgotten guard can't leave a route open.
- The guard **reloads the user from the database on every request**. The token only proves "this was user X". The database decides whether user X still exists.
- The logged-in user has only an id and an email. Roles are not stored on the user, because roles belong to a project, not to a person.

---

# 2. Resources (projects / repositories)

## What the end user sees

- "Create resource": give it a name and a short URL name (the slug), for example "billing-service". You become its Owner.
- "My resources": a list of every project you belong to, with your role in each.
- An Owner can rename the project, change its main branch name, or delete it.
- Each resource has a clone address that people use with git.

## Requirements

- A resource is a **real git repository on the server's disk**, not a pretend record.
- The slug must be unique and limited to lowercase letters, digits and dashes. That makes it safe and easy to read in URLs.
- User text must **never** become a file or folder path on disk. Otherwise a name like "../../etc" could reach places it shouldn't (this is called path traversal).
- If someone isn't a member, the system must not even reveal that the project exists.
- Creating or deleting a resource must not leave the database and the disk out of sync.

## Solution

- **Database:** a Resource row with name, slug and default branch (normally "main").
- **Disk:** one **bare** repository per resource, inside a folder set by a new setting, `GIT_REPO_ROOT`. A bare repo has only git's history data and no checked-out files. Servers like GitHub keep repos this way because nobody edits files directly on the server.
- The folder is named after the resource's **id** (a random UUID that the system generates), never the slug. That removes path traversal completely. The user never controls the folder name.
- When a resource is created:
  1. The database row is created, and the creator is made Owner in the same database transaction.
  2. The bare repo is created on disk.
  3. The default branch name is saved inside the repo's own git config, so the git hook (section 6) can read it without asking our database.
  4. The branch protection hook file is installed and made executable.
- **Database and disk can't share one transaction.** If the disk step fails, we delete the database row we just made. This is the "compensating action" pattern: undo step one when step two fails.
- Delete removes the database rows (memberships and credentials are removed with them) and then the folder.
- The `GIT_REPO_ROOT` setting is checked at startup. If it is missing, the app refuses to start. Failing early at startup is much better than failing on the first user request.

**Current status:** the database part is built. The disk part is the next step.

---

# 3. Members and roles

## What the end user sees

- An Owner adds people by email. They join as Members.
- An Owner can promote a Member to Owner, or demote an Owner back to Member. Several Owners are allowed.
- An Owner can remove anyone.
- If you are the **last** Owner, the system refuses to let you demote or remove yourself, or be removed. The project always has someone in charge.
- Members can see the member list but can't change it.

## Requirements

- There are two roles, and they only apply inside a project: **OWNER** and **MEMBER**. Alice can be Owner of one project and Member of another.
- What each role may do:
  - **Member:** read the project, push their own branches, open contributions, and create credentials for themselves.
  - **Owner:** everything a Member can do, plus managing members, merging into main, approving or rejecting contributions, revoking anyone's credential, and editing or deleting the project.
- Role checks must live in **one place**, so adding a role later (for example a read-only "Viewer") is a tiny change.
- A project must never be left with no Owner.
- Adding an email that doesn't exist gives a clear "not found".
- Not a member at all → **404**, so outsiders can't confirm the project exists. A member whose role is too low → **403**.

## Solution

- **Rank-based roles (already built):** each role has a number (Member is lower, Owner is higher). A route says "needs at least Owner". One helper compares the numbers. This is a simple form of role hierarchy. To research: RBAC (role-based access control) and role hierarchy.
- **ResourceRoleGuard (already built):**
  - reads the resource id from the URL
  - loads the caller's membership **live** from the database
  - checks the rank
  - attaches the membership to the request, so the controller doesn't look it up twice
- **The last-Owner rule** is checked inside a database transaction. The system counts Owners and blocks the change if the count would become zero. Watch out here: two Owners demoting each other at the same moment could both pass the check. The transaction must be strong enough to stop that. To research: transaction isolation levels and row locking ("SELECT … FOR UPDATE") in PostgreSQL. This is the same kind of problem as edge cases 9 and 13.

---

# 4. Credentials (keys for git and automation)

## What the end user sees

- Inside a project, click "create credential":
  - give it a name, for example "laptop" or "CI pipeline"
  - choose an expiry date
  - choose a scope: **READ** (clone and fetch only) or **READ_WRITE** (push too)
- The secret is shown **once**. If you lose it, you make a new one.
- You see a list of your own credentials: name, scope, expiry and status. The secret is never shown again.
- You can revoke your own credentials. Owners can revoke anyone's.
- With git, you use the credential's public id as the username and the secret as the password.

## Requirements and the edge cases they cover

| Edge case | What the system must do |
|---|---|
| 1. Key shown but never saved | Show the secret only **after** the database save has succeeded. |
| 2. Database leak exposes keys | Store only a hash of the secret, never the secret itself. |
| 3. Predictable keys | Make secrets with a cryptographically secure random generator. |
| 4. Two keys with the same hash | Use a strong hash, plus a unique rule in the database as a final guard. |
| 5. Broken key format crashes the server | Check the format first and reject cleanly with 401, before any database query. |
| 6. Invisible characters in names | Clean up names (Unicode normalize, trim, reject invisible and control characters) before the duplicate check. |
| 8. Timing attack | Compare hashes in constant time. |
| 10. Junior gives themselves admin rights | A credential can never do more than its creator's **current** role allows. |
| 11. Demoted employee | The creator's role is checked live on every use, not when the key was created. |
| 13. Two creates with the same name at once | A unique database rule on project + name. The database decides, not an earlier check in code. |
| 14. Retry after a network drop creates two keys | The client sends an **idempotency key**. A repeated request with the same key returns the first result instead of making a new key. |

## Solution

- **Two-part key:**
  - a **public id**, which is fine to show and is used to find the row
  - a **secret**, which is random and shown once
- **Hashing:** the secret is stored as a SHA-256 hash. Why not bcrypt like passwords? Our secrets are long and fully random, so nobody can guess them by brute force, and a fast hash is enough. A slow hash would only make every git request slower. bcrypt stays for passwords, because people choose weak ones. To research: why passwords need slow hashes but random tokens don't.
- **Constant-time compare** of the hashes, using Node's built-in function for this. To research: timing attacks.
- **Status checks on every use:** not revoked, not expired, and the creator is still a member of the project.
- **Revoke** sets a revoked time. It is never undone. Combined with the live check, a key used one millisecond after revoke is rejected (edge case 9).
- **Idempotency key:** unique per project. If the same key arrives twice, the second request finds the first row instead of creating a new one. To research: idempotency keys (Stripe's API docs explain them well).

---

# 5. Git hosting (clone and push over HTTP)

## What the end user sees

- Run `git clone https://<server>/git/<resource-id>`. Git asks for a username and password. Enter the public id and the secret.
- Clone, fetch and pull work with READ or READ_WRITE.
- Push works only with READ_WRITE.
- A wrong, expired or revoked credential gets a normal git "authentication failed" message.

## Requirements

- Work with a normal, unmodified git client.
- Git login (Basic Auth with a credential) is separate from the dashboard login (JWT).
- Find out whether a request is a read or a write, and check the scope against it.
- Never crash on broken or strange headers (edge case 12). Answer 401 instead.
- Record **every** attempt (success, not found, malformed, wrong secret, expired, revoked, not enough role) as an AccessEvent.
- A credential works only for its own project, never for another project.

## Solution

- **Git's "smart HTTP" protocol:** git clients talk to servers over plain HTTP with a few fixed URLs. Git ships a program, `git http-backend`, that does the server side. We don't rebuild git. Our NestJS route checks the login, then hands the request to that program and streams the data both ways. To research: the git smart HTTP protocol, and CGI (how a web server passes a request to a separate program).
- First we test the `git-http-backend` npm package. If it doesn't work with our git and Node versions, we run git's own program directly. The design is the same either way.
- **Request body:** git sends binary data, not JSON. We must confirm that NestJS's body parser leaves that data alone, so it can stream straight to git. This is the same streaming and backpressure topic as your Redis project.
- **The route** is marked `@Public()` so the JWT guard skips it. It has its own **GitAuthGuard** instead.
- **What GitAuthGuard does:**
  1. Reads the Basic Auth header. If it is missing, it replies 401 with the special header that makes git ask for login.
  2. Checks the format. Anything broken gets a clean 401 (edge cases 5 and 12).
  3. Finds the credential by public id and compares hashes in constant time.
  4. Checks: not revoked, not expired, belongs to **this** project, and the creator is still a member (live check).
  5. Works out read or write from the git service named in the URL, then checks the scope.
  6. Writes an AccessEvent row whatever the result.

---

# 6. Branch protection

## What the end user sees

- Only Owners can change the main branch, whether by push, force-push or delete.
- When a Member tries, git shows a clear message like "main is protected, open a contribution instead".
- Any member with a write credential can push any other branch.

## Requirements

- The rule must hold for **every** way a branch can change, including force-push and delete.
- It uses the pusher's **current** role (edge case 11).
- If an Owner renames the default branch, the protection moves to the new name.

## Solution

- **The pre-receive hook:** a small script that git runs on the server before it accepts a push. Git passes it a list of "this branch moves from commit A to commit B". If the script exits with an error, git rejects the whole push. To research: git server-side hooks, especially pre-receive.
- When our server starts git, it passes the pusher's user id and live role as environment variables. Git passes them on to the hook.
- The hook reads the default branch name from the repo's git config. That is why we save it there in section 2.
- If a change touches the default branch and the role isn't OWNER, the push is rejected.
- **Accepted trade-off:** the hook trusts the role that our own server gave it. That is safe because only our server starts git on this machine.

---

# 7. Contributions (our pull requests)

## What the end user sees

- After pushing a branch, a Member opens a contribution: pick the branch and write a title.
- Many contributions can be open at once, from different people and branches. They don't wait for each other.
- Anyone in the project can see the list (filtered by open, merged or rejected) and view the **diff**: the changes compared to main.
- An Owner clicks **Approve**, and the branch is merged into main for real, with a merge commit. Or the Owner clicks **Reject**, which closes it. The branch stays, so the author can still use it.
- If the branch conflicts with main, approve fails with "conflicts, push an updated branch".
- If two Owners approve different contributions at the same moment, one succeeds and the other is told "main changed, try again". Nothing breaks.

## Requirements

- When opening a contribution:
  - the branch must really exist
  - it must not be the default branch
  - the default branch must exist (an empty repo has nothing to merge into)
- One contribution per branch per project.
- The diff is always computed fresh, so it's never out of date.
- A merge must never leave main half-changed, never lose another person's merge, and never leave temporary files behind.

## Solution

- **Database:** a Contribution row with project, author, branch, title, status (OPEN, MERGED or REJECTED) and times. It has a unique rule on project + branch.
- **Diff:** runs git's diff between main and the branch each time someone asks.
- **How a merge works:**
  1. Make a temporary **worktree**: a separate working folder linked to the bare repo, with a unique name.
  2. Merge the branch into it, always with a merge commit, using the approving Owner as the committer.
  3. If there are conflicts: cancel the merge and return 409.
  4. If it works: move main to the new commit using **update-ref with the expected old value**. This is a compare-and-swap. It tells git "move main to X, but only if it still points at Y". If another Owner merged first, git refuses, and we return 409. This fixes the race between two approvals with no extra locking. To research: compare-and-swap and optimistic concurrency control. It is the same idea as version columns in databases.
  5. **Always clean up**, whether the merge worked or failed: remove the worktree and the temporary branch.
  6. Mark the row MERGED.

---

# 8. Access events (audit log)

## What the end user sees

A history of every attempt to use a credential: when it happened, which credential, and what the result was.

## Requirements

- Record failures too. Failures are the most useful thing to see during an attack.
- Record attempts even when the credential doesn't exist. So the row keeps the public id the caller sent, and the link to a real credential is optional.
- Keep the history after a credential is deleted.

## Solution

An AccessEvent table:

- the public id that was sent
- an optional link to the credential (cleared, not deleted, when the credential is removed)
- the outcome
- the time

Only GitAuthGuard writes to it.

---

# 9. Known gaps we accept

These are rare, easy to see when they happen, and cheap to fix by hand. Building full protection for them would be over-engineering for this project.

- **Disk and database can disagree** if the process crashes between the two steps. The "undo the first step" logic covers normal failures, but not a crash in the middle.
- **A crash in the middle of a merge** leaves an old worktree folder. Running git's worktree prune command removes it.
- **A member can overwrite another member's branch** with a write credential. GitHub collaborators can do the same.
- **The git merge can succeed but the database update fail**, leaving the contribution marked OPEN even though its changes are in main.

---

# 10. Order of work, and where we are

1. Schema and migration: **partly done**. The default branch field and the Contribution table are still missing. Each is added when it's first needed.
2. Auth changes: **done**.
3. Role checks (rank, decorator, guard): **done**.
4. Creating the git repo on disk: **← next step**.
5. Resources module: database part **done**. It gets the disk steps in step 4.
6. Members.
7. Credentials.
8. Git login and the git HTTP route.
9. Contributions and merging.
10. Wire everything into the app module.
11. Rewrite `business-logic.md` to match this design.

---

If any part is unclear or seems wrong to you, especially the business rules in sections 3, 4 and 7, tell me now. Changing them is easy while we are still discussing, and much harder after they're built. I can also turn this into a page you can keep and share, if that would help.