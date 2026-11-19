// @vitest-environment node
/**
 * deploy/backup.sh with stand-ins for restic, podman, docker and systemctl: which snapshots it
 * makes, and what of the server's settings goes into the one tagged config.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

const setup = (mode: "quadlet" | "compose") => {
  const root = mkdtempSync(join(tmpdir(), "backup-"));
  roots.push(root);
  const bin = join(root, "bin");
  const deploy = join(root, "deploy");
  const volumes = join(root, "volumes");
  const quadlet = join(root, "quadlet");
  const captured = join(root, "captured");
  const calls = join(root, "calls");
  const config = join(root, "run", "kontext-backup-config");
  const prefix = mode === "compose" ? "kontext_" : "";
  for (const dir of [bin, deploy, quadlet, captured, join(root, "run")]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const name of ["stalwart-data", "kontext-data", "stalwart-config"]) {
    mkdirSync(join(volumes, prefix + name), { recursive: true });
  }
  writeFileSync(join(volumes, `${prefix}stalwart-config`, "config.json"), '{"store":"rocksdb"}');

  const script = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  const volumeInspect = `for last; do :; done; [ -d "${volumes}/$last" ] && echo "${volumes}/$last"`;
  script("podman", `case "$1 $2" in "volume inspect") ${volumeInspect} ;; *) exit 0 ;; esac`);
  script(
    "docker",
    `case "$1 $2" in
  "volume inspect") ${volumeInspect} ;;
  "compose -f") [ "$4" = ps ] && echo stalwart; exit 0 ;;
esac`,
  );
  script("systemctl", `[ "$1" = is-active ] && exit 3; exit 0`);
  // restic: every call into the log; the config snapshot's directory copied as it was then.
  script(
    "restic",
    `echo "$*" >> "${calls}"
case "$1" in
  backup) case "$*" in *"--tag config"*) for last; do :; done; cp -a "$last/." "${captured}/" ;; esac ;;
  stats) echo '{"total_size":1024}' ;;
esac
exit 0`,
  );

  for (const name of ["backup.sh", "backup-host.sh"]) {
    cpSync(join(import.meta.dirname, name), join(deploy, name));
  }
  const settings = [
    "KONTEXT_DOMAIN=kontext.firma.de",
    "RESTIC_REPOSITORY=s3:https://abc.eu.r2.cloudflarestorage.com/kontext-firma",
    "RESTIC_PASSWORD=restic-geheim",
    "AWS_ACCESS_KEY_ID=key-id",
    "AWS_SECRET_ACCESS_KEY=key-secret",
  ].join("\n");
  writeFileSync(join(deploy, "Caddyfile"), "{$KONTEXT_DOMAIN} {}\n");
  writeFileSync(join(deploy, "livekit.yaml"), "port: 7880\n");
  if (mode === "quadlet") {
    writeFileSync(join(deploy, "backup.env"), `${settings}\n`);
    writeFileSync(join(deploy, "kontext.env"), "BETTER_AUTH_SECRET=auth-secret\n");
    writeFileSync(join(deploy, "stalwart.env"), "STALWART_BLOB_KEY=blob-geheim\n");
    writeFileSync(join(quadlet, "kontext.container"), "[Container]\nImage=kontext:0.1.29\n");
    writeFileSync(
      join(quadlet, "stalwart.container"),
      "[Container]\nEnvironment=STALWART_BLOB_KEY=blob-geheim\n",
    );
    mkdirSync(join(quadlet, "users"));
  } else {
    writeFileSync(
      join(deploy, ".env"),
      `${settings}\nSTALWART_BLOB_KEY=blob-geheim\nBETTER_AUTH_SECRET=auth-secret\n`,
    );
  }

  const result = spawnSync(join(deploy, "backup.sh"), [], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      KONTEXT_QUADLET_DIR: quadlet,
      KONTEXT_BACKUP_CONFIG: config,
      KONTEXT_BACKUP_LOCK: join(root, "backup.lock"),
    },
  });
  const read = (path: string) => readFileSync(join(captured, path), "utf8");
  return { result, captured, config, read, restic: () => readFileSync(calls, "utf8") };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backup.sh", () => {
  it("backs up the Quadlet server's settings without the Restic password and the storage key", () => {
    const { result, read, captured } = setup("quadlet");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    expect(read("deploy/backup.env")).toContain("RESTIC_REPOSITORY=s3:https://abc.eu.r2");
    expect(read("deploy/backup.env")).toContain("\nRESTIC_PASSWORD=\n");
    expect(read("deploy/stalwart.env")).toBe("STALWART_BLOB_KEY=\n");
    expect(read("deploy/kontext.env")).toBe("BETTER_AUTH_SECRET=auth-secret\n");
    expect(read("deploy/Caddyfile")).toBe("{$KONTEXT_DOMAIN} {}\n");
    expect(read("deploy/livekit.yaml")).toBe("port: 7880\n");
    expect(read("quadlet/kontext.container")).toContain("Image=kontext:0.1.29");
    expect(read("quadlet/stalwart.container")).toContain("Environment=STALWART_BLOB_KEY=\n");
    expect(read("stalwart-config/config.json")).toBe('{"store":"rocksdb"}');
    expect(existsSync(join(captured, "quadlet", "users"))).toBe(false);
  });

  it("backs up the Compose server's .env without the secrets and no Quadlet units", () => {
    const { result, read, captured } = setup("compose");
    expect(result.status).toBe(0);

    const env = read("deploy/.env");
    expect(env).toContain("\nRESTIC_PASSWORD=\n");
    expect(env).toContain("\nSTALWART_BLOB_KEY=\n");
    expect(env).toContain("BETTER_AUTH_SECRET=auth-secret");
    expect(env).not.toContain("geheim");
    expect(read("stalwart-config/config.json")).toBe('{"store":"rocksdb"}');
    expect(existsSync(join(captured, "quadlet"))).toBe(false);
  });

  it("tags the settings config, tidies them up like the rest and leaves no copy behind", () => {
    const { result, config, restic } = setup("quadlet");
    expect(result.status).toBe(0);
    expect(restic()).toContain(`backup --tag config --host kontext.firma.de ${config}`);
    expect(restic()).toContain("forget --tag config --keep-daily 14");
    expect(existsSync(config)).toBe(false);
  });
});
