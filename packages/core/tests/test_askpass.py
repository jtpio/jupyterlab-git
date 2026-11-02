import os
import re
import shutil
import signal
import subprocess
import sys

import pytest

from jupyterlab_git_core.askpass import (
    BAD_PASSPHRASE_MESSAGE,
    PASSPHRASE_ENV,
    askpass_env,
    main,
)
from jupyterlab_git_core.git import execute
from jupyterlab_git_core.ssh import SSH

posix_only = pytest.mark.skipif(os.name == "nt", reason="requires POSIX")
needs_openssh = pytest.mark.skipif(
    os.name == "nt" or not (shutil.which("ssh-agent") and shutil.which("ssh-keygen")),
    reason="requires OpenSSH",
)


@pytest.mark.parametrize(
    "prompt",
    [
        "Enter passphrase for key '/home/me/.ssh/id_ed25519': ",
        "Enter passphrase for /home/me/.ssh/id_ed25519: ",
        "Enter passphrase for /home/me/.ssh/id_ed25519 (will confirm each use): ",
    ],
)
def test_main_reports_locked_key(prompt, capsys, monkeypatch):
    monkeypatch.delenv(PASSPHRASE_ENV, raising=False)

    assert main(prompt) == 1

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "SSH key '/home/me/.ssh/id_ed25519' is locked" in captured.err


def test_main_answers_passphrase(capsys, monkeypatch):
    monkeypatch.setenv(PASSPHRASE_ENV, "open sesame")

    assert main("Enter passphrase for /home/me/.ssh/id_ed25519: ") == 0
    assert capsys.readouterr().out == "open sesame\n"


def test_main_stops_on_bad_passphrase(capsys, monkeypatch):
    monkeypatch.setenv(PASSPHRASE_ENV, "wrong")

    assert main("Bad passphrase, try again for /home/me/.ssh/id_ed25519: ") == 1

    captured = capsys.readouterr()
    assert captured.out == ""
    assert BAD_PASSPHRASE_MESSAGE in captured.err


@pytest.mark.parametrize(
    "prompt",
    [
        "Are you sure you want to continue connecting (yes/no/[fingerprint])? ",
        "Username for 'https://github.com': ",
    ],
)
def test_main_refuses_other_prompts(prompt, capsys, monkeypatch):
    monkeypatch.setenv(PASSPHRASE_ENV, "open sesame")

    assert main(prompt) == 1
    assert capsys.readouterr() == ("", "")


def test_main_accepts_notifications(monkeypatch):
    monkeypatch.setenv("SSH_ASKPASS_PROMPT", "none")

    assert main("Confirm user presence for key ED25519-SK") == 0


@posix_only
def test_askpass_script():
    env = askpass_env("open sesame")

    result = subprocess.run(
        [env["SSH_ASKPASS"], "Enter passphrase for /tmp/id_ed25519: "],
        env={**os.environ, **env},
        capture_output=True,
        text=True,
    )

    assert env["SSH_ASKPASS_REQUIRE"] == "force"
    assert result.returncode == 0
    assert result.stdout == "open sesame\n"


@posix_only
def test_askpass_script_is_recreated():
    os.remove(askpass_env()["SSH_ASKPASS"])

    assert os.access(askpass_env()["SSH_ASKPASS"], os.X_OK)


@posix_only
@pytest.mark.asyncio
async def test_execute_has_no_terminal_and_uses_askpass(tmp_path):
    code, output, _ = await execute(
        [
            sys.executable,
            "-c",
            "import os; print(os.getsid(0) == os.getpid(), os.environ['SSH_ASKPASS_REQUIRE'])",
        ],
        cwd=str(tmp_path),
    )

    assert code == 0
    assert output.strip() == "True force"


@pytest.fixture
def ssh_agent(tmp_path, monkeypatch):
    socket = tmp_path / "agent.sock"
    output = subprocess.run(
        ["ssh-agent", "-s", "-a", str(socket)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    monkeypatch.setenv("SSH_AUTH_SOCK", str(socket))
    yield
    os.kill(int(re.search(r"SSH_AGENT_PID=(\d+)", output).group(1)), signal.SIGTERM)


@needs_openssh
@pytest.mark.asyncio
async def test_add_key(ssh_agent, tmp_path):
    key = tmp_path / "id_ed25519"
    subprocess.run(
        ["ssh-keygen", "-q", "-t", "ed25519", "-N", "open sesame", "-f", str(key)],
        check=True,
    )

    wrong = await SSH().add_key(str(key), "wrong")
    right = await SSH().add_key(str(key), "open sesame")

    assert wrong["code"] != 0
    assert wrong["bad_passphrase"]
    assert right["code"] == 0
    assert not right["bad_passphrase"]
    agent_keys = subprocess.run(["ssh-add", "-L"], capture_output=True, text=True)
    assert (
        agent_keys.stdout.split()[1] == key.with_suffix(".pub").read_text().split()[1]
    )


@needs_openssh
@pytest.mark.asyncio
async def test_add_key_without_agent(tmp_path, monkeypatch):
    monkeypatch.delenv("SSH_AUTH_SOCK", raising=False)
    key = tmp_path / "id_ed25519"
    subprocess.run(
        ["ssh-keygen", "-q", "-t", "ed25519", "-N", "open sesame", "-f", str(key)],
        check=True,
    )

    result = await SSH().add_key(str(key), "open sesame")

    assert result["code"] != 0
    assert not result["bad_passphrase"]
    assert "agent" in result["message"]
