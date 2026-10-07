"""Inspect an encrypted archive without materializing plaintext or emitting rows."""
import base64
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from importlib.util import module_from_spec, spec_from_file_location

sys.stdout.reconfigure(encoding="utf-8")
helper_spec = spec_from_file_location("rehearsal", Path(__file__).with_name("rehearse-database-migration.py"))
helper = module_from_spec(helper_spec)
helper_spec.loader.exec_module(helper)

def main():
    directory = Path(sys.argv[1]).resolve()
    if directory.parent != (Path.home()/".terraqo-private").resolve():
        raise RuntimeError("Archive must be in the protected migration directory.")
    protected = (directory/"key.dpapi").read_text(encoding="ascii")
    recovered = helper.command(["powershell","-NoProfile","-Command","Add-Type -AssemblyName System.Security; $protectedKey=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($protectedKey,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))"],input_text=protected)
    encrypted = (directory/"source.dump.aesgcm").read_bytes()
    archive = AESGCM(base64.b64decode(recovered)).decrypt(encrypted[:12],encrypted[12:],b"Terraqo database migration v1")
    result = subprocess.run([str(helper.BIN/"pg_restore.exe"),"--list"],input=archive,capture_output=True,timeout=30)
    if result.returncode:
        raise RuntimeError("Archive catalog inspection failed.")
    counts = Counter()
    for line in result.stdout.decode("utf-8").splitlines():
        if not line.startswith(';') and ';' in line:
            parts = line.split(';',1)[1].strip().split()
            kind = parts[2]
            if kind in ("FK", "TABLE", "SEQUENCE") and len(parts)>3:
                kind += " " + parts[3] if parts[3] in ("CONSTRAINT","DATA","SET") else ""
            counts[kind] += 1
    print(json.dumps(dict(counts),indent=2))

if __name__=="__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError):
        print("Archive inspection failed; private details suppressed.")
        raise SystemExit(1)
