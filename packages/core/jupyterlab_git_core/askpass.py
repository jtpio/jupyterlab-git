"""
SSH_ASKPASS helper for the git commands run by the server.

ssh calls this helper instead of prompting on the terminal that runs Jupyter.
The script runs in isolated mode, so it must only import the standard library.
"""

import atexit
import os
import re
import shlex
import shutil
import sys
import tempfile
from typing import Dict, Optional

PASSPHRASE_ENV = "JUPYTERLAB_GIT_SSH_PASSPHRASE"
LOCKED_KEY_MESSAGE = "SSH key '{key}' is locked: a passphrase is required."
LOCKED_KEY_PATTERN = re.compile(r"SSH key '(?P<key>.+)' is locked")
BAD_PASSPHRASE_MESSAGE = "Incorrect passphrase for the SSH key."
# ssh asks "Enter passphrase for key '<path>': ", ssh-add asks "Enter passphrase for <path>: "
KEY_PROMPT = re.compile(
    r"^Enter passphrase for (?:key '(?P<quoted>.+)'|(?P<path>.+?)(?: \(will confirm each use\))?):\s*$"
)

_script: Optional[str] = None


def askpass_env(passphrase: Optional[str] = None) -> Dict[str, str]:
    """
    Environment variables that make ssh use this helper for all its prompts.

    With a passphrase, the helper answers the passphrase prompt (used by ssh-add).
    """
    global _script
    if os.name == "nt":
        return {}
    # The temporary directory can be cleaned up while the server is running.
    if _script is None or not os.path.exists(_script):
        directory = tempfile.mkdtemp(prefix="jupyterlab-git-")
        atexit.register(shutil.rmtree, directory, ignore_errors=True)
        script = os.path.join(directory, "askpass")
        with open(script, "w") as f:
            f.write(
                '#!/bin/sh\nexec {} -I {} "$@"\n'.format(
                    shlex.quote(sys.executable),
                    shlex.quote(os.path.abspath(__file__)),
                )
            )
        os.chmod(script, 0o700)
        # Git commands run in worker threads: only share the script once it is complete.
        _script = script

    env = {"SSH_ASKPASS": _script, "SSH_ASKPASS_REQUIRE": "force"}
    if passphrase is not None:
        env[PASSPHRASE_ENV] = passphrase
    return env


def main(prompt: str) -> int:
    """
    Answer an ssh prompt, or report the locked key on stderr and refuse.
    """
    # Notification only, for example to touch a security key
    if os.environ.get("SSH_ASKPASS_PROMPT") == "none":
        return 0
    if prompt.startswith("Bad passphrase"):
        print(BAD_PASSPHRASE_MESSAGE, file=sys.stderr)
        return 1
    match = KEY_PROMPT.match(prompt)
    # Host key confirmations and git credential prompts are refused.
    if match is None:
        return 1
    passphrase = os.environ.get(PASSPHRASE_ENV)
    if passphrase is not None:
        print(passphrase)
        return 0
    print(
        LOCKED_KEY_MESSAGE.format(key=match["quoted"] or match["path"]),
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
