// Runs inside every repo before git accepts a push. It reads the default branch
// from HEAD and rejects any change to it (push, force-push, delete) unless the
// server passed ACCESS_HUB_ROLE=OWNER. A missing role counts as "not an owner".
export const PRE_RECEIVE_HOOK = `#!/bin/sh
default_ref=$(git symbolic-ref HEAD) || exit 1

while read -r _ _ ref; do
  if [ "$ref" = "$default_ref" ] && [ "$ACCESS_HUB_ROLE" != "OWNER" ]; then
    echo "error: $ref is protected. Push another branch and open a contribution." >&2
    exit 1
  fi
done

exit 0
`;
