#!/usr/bin/env node
// Generates a synthetic synobackup.conf with 1500 Hyper Backup tasks to stress
// SynoAnalyzer's coverage engine and UI. 100% fake data — no real config values.
// Usage: node scripts/gen-stresstest.mjs > stresstest.conf
//
// Shape: 150 "shares" × 10 tasks. Each share has a base directory backed up to
// cloud + local (full 3-2-1), plus 8 subdirectory tasks — some excluded from the
// cloud task (deliberate carve-outs → Medium), some not. Every 8th share has no
// cloud copy at all (→ High). Sprinkled encryption/integrity/version/notify gaps
// exercise the full recommendation set.

const PER_SHARE = 10;
// Total tasks = first CLI arg (default 1500), rounded to a whole number of shares.
const TOTAL = Number(process.argv[2]) || 1500;
const SHARES = Math.max(1, Math.round(TOTAL / PER_SHARE));
const out = [];
let id = 0;

const q = s => `"${s}"`;
const arr = items => '[' + items.map(q).join(',') + ']';

function repoBlock(cloud, vol, prov) {
  out.push(`[repo_${id}]`, `name=""`);
  if (cloud) {
    out.push(
      `remote_bucket="bucket${id}"`,
      `remote_key="SYNTHETICKEY${id.toString().padStart(10, '0')}"`,
      `remote_secret="synthetic-secret-${id}=="`,
      `remote_url="s3.synthetic-${prov}.example.com"`,
      `signature_version="v4"`,
      `target_type="cloud_image"`,
      `trans_type="aws_s3"`,
    );
  } else {
    out.push(`remote_share="usbshare${vol}"`, `target_type="image"`, `trans_type="image_local"`);
  }
}

function taskBlock({ cloud, vol, prov, name, folders, excludes, enc, integ, notify, compress, maxVer, transEnc, ctime }) {
  repoBlock(cloud, vol, prov);
  out.push(
    `[task_${id}]`,
    `backup_apps=[]`,
    `backup_data_type="data"`,
    `backup_filter={"exclude_list":${arr(excludes)},"whitelist":[]}`,
    `backup_folders=${arr(folders)}`,
    `create_time=${ctime}`,
    `data_compress_type=${compress ? 1 : 0}`,
    `enable_data_encrypt=${enc}`,
    `enable_delete=true`,
    `enable_notify=${notify}`,
    `enable_version_rotation=true`,
    `incheck_info="{\\"data_enable\\":${integ},\\"date\\":\\"2024/1/1\\",\\"time_limit\\":0}\\n"`,
    `incheck_sched_id=${id}`,
    `name=${q(name)}`,
    `repo_id=${id}`,
    `rotate_condition="[1,${maxVer}]"`,
    `rotate_option="rotate_smart_recycle"`,
    `sched_id=${id}`,
    `support_cross_file_dedup=true`,
    `target_dir="nas01_${id}.hbk"`,
  );
  if (cloud) out.push(`trans_encrypt=${transEnc}`);
}

out.push(`[global]`, `repo_id_max=${SHARES * PER_SHARE}`, `task_id_max=${SHARES * PER_SHARE}`, `version="4.1.2-4045"`);

const now = Math.floor(Date.now() / 1000);

for (let s = 0; s < SHARES; s++) {
  const vol = 1 + (s % 6);
  const prov = s % 5 === 0 ? 'east' : 'west'; // mostly one provider
  const isVm = s % 17 === 0;
  const isGap = s % 8 === 0;       // no cloud copy for this whole share
  const kind = isVm ? 'vmdatastore' : 'share';
  const base = `/volume${vol}/${kind}${String(s).padStart(3, '0')}`;
  // sub0 & sub1 are excluded from the cloud task → deliberate carve-outs
  const carveouts = [`${base}/sub0/`, `${base}/sub1/`];

  for (let k = 0; k < PER_SHARE; k++) {
    id++;
    const gi = id; // global task index for varying flags
    const common = {
      vol, prov,
      enc: gi % 23 !== 0,                       // ~4% unencrypted   → High
      integ: isVm ? false : (gi % 11 !== 0),    // VMs + ~9% no integrity
      notify: gi % 7 !== 0,                     // ~14% no notify    → Low
      compress: !isVm,                          // VM tasks uncompressed → Low (non-media)
      maxVer: isVm ? 10 : (gi % 13 === 0 ? 5 : 30), // VM<14 → High; some low
      transEnc: gi % 19 !== 0,                  // some cloud no transit enc → Medium
      ctime: now - (s % 40) * 30 * 86400 - (s % 9 === 0 ? 1300 * 86400 : 0), // a few > 3yr → Low
    };

    if (k === 0) {
      // base copy #1 — cloud (unless gap share, then local)
      taskBlock({ ...common, cloud: !isGap, name: `Cloud ${kind} ${s}`, folders: [base], excludes: isGap ? [] : carveouts });
    } else if (k === 1) {
      // base copy #2 — local
      taskBlock({ ...common, cloud: false, name: `Local ${kind} ${s}`, folders: [base], excludes: [] });
    } else {
      // 8 subdirectory tasks, local-only
      const sub = `${base}/sub${k - 2}`;
      taskBlock({ ...common, cloud: false, name: `Local ${kind} ${s} sub${k - 2}`, folders: [sub], excludes: [] });
    }
  }
}

process.stdout.write(out.join('\n') + '\n');
