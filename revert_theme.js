const fs = require('fs');

const files = [
  'src/components/features/admin/dashboard/AdminDashboard.tsx',
  'src/components/features/admin/dashboard/StationStatusPanel.tsx',
  'src/components/features/admin/dashboard/ActivityFlow.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/red-950/g, 'slate-900').replace(/red-900/g, 'slate-800');
  c = c.replace('className="pl-7 text-sm font-bold uppercase tracking-[0.24em] text-red-700">NGUYÊN ANH GROUP - {clock}', 'className="pl-7 text-sm font-bold uppercase tracking-[0.24em] text-slate-500">{t(\'systemTime\')}: {clock}');
  fs.writeFileSync(f, c);
  console.log('Reverted ' + f);
});
