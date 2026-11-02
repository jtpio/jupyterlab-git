"""
Module for executing SSH commands
"""

import os
import re
import subprocess
from pathlib import Path

import anyio

from .askpass import BAD_PASSPHRASE_MESSAGE, askpass_env
from .log import get_logger

GIT_SSH_HOST = re.compile(r"git@(.+):.+")


class SSH:
    """
    A class to perform ssh actions
    """

    def is_known_host(self, hostname):
        """
        Check if the provided hostname is a known one
        """
        cmd = ["ssh-keygen", "-F", hostname.strip()]
        try:
            subprocess.check_call(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except Exception:
            get_logger().debug("Error verifying host using ssh-keygen command")
            return False
        else:
            return True

    def add_host(self, hostname):
        """
        Add the host to the known_hosts file
        """
        get_logger().debug(f"adding host to the known hosts file {hostname}")
        try:
            result = subprocess.run(
                ["ssh-keyscan", hostname], capture_output=True, text=True, check=True
            )
            known_hosts_file = f"{Path.home()}/.ssh/known_hosts"
            with open(known_hosts_file, "a") as f:
                f.write(result.stdout)
            get_logger().debug(f"Added {hostname} to known hosts.")
        except Exception as e:
            get_logger().error(f"Failed to add host: {e}.")
            raise e

    async def add_key(self, key: str, passphrase: str) -> dict:
        """
        Add a passphrase-protected private key to the running SSH agent.
        """
        env = askpass_env(passphrase)
        if not env:
            return {"code": 1, "message": "Not supported on this platform."}

        def run() -> subprocess.CompletedProcess:
            return subprocess.run(
                ["ssh-add", key],
                env={**os.environ, **env},
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                start_new_session=True,
                timeout=30,
            )

        try:
            result = await anyio.to_thread.run_sync(run)
        except (OSError, subprocess.SubprocessError) as e:
            get_logger().error(f"Failed to add the SSH key to the agent: {e}")
            return {"code": 1, "message": str(e)}

        message = result.stderr.strip()
        return {
            "code": result.returncode,
            "message": message,
            "bad_passphrase": BAD_PASSPHRASE_MESSAGE in message,
        }
