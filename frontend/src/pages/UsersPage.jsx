import { Edit, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Loading from '../components/Loading.jsx';
import { useRealtime } from '../hooks/useRealtime.js';
import { alertError, confirmDanger, toastSuccess } from '../utils/alerts.js';

const blank = { name: '', username: '', password: '', phone: '', role: 'employee', is_active: 1 };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.users();
      setUsers(res.data || []);
    } catch (err) {
      alertError(err, 'โหลดผู้ใช้งานไม่ได้');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtime((payload) => { if (payload?.kind === 'users') load(true); }, true);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    try {
      if (editing) await api.updateUser(editing.id, form);
      else await api.createUser(form);
      toastSuccess(editing ? 'แก้ไขผู้ใช้แล้ว' : 'สร้างผู้ใช้แล้ว');
      setForm(blank); setEditing(null); load(true);
    } catch (err) { alertError(err, 'บันทึกผู้ใช้ไม่ได้'); }
  }

  function startEdit(user) {
    setEditing(user);
    setForm({ name: user.name || '', username: user.username || '', password: '', phone: user.phone || '', role: user.role || 'employee', is_active: user.is_active ?? 1 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(user) {
    const ok = await confirmDanger(`ปิดใช้งาน ${user.name || user.username}?`, 'ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้');
    if (!ok) return;
    try { await api.deleteUser(user.id); toastSuccess('ปิดใช้งานผู้ใช้แล้ว'); load(true); } catch (err) { alertError(err, 'ลบผู้ใช้ไม่ได้'); }
  }

  if (loading) return <Loading />;

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">จัดการพนักงาน</h1>
        <p className="page-subtitle">แยกสิทธิ์ Owner และ Employee ชัดเจน พนักงานจะไม่เห็น Dashboard</p>
      </div>
      <form onSubmit={submit} className="card p-4 md:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><UserPlus size={20} /> {editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="ชื่อ-สกุล" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field required label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <Field required={!editing} type="password" label={editing ? 'รหัสผ่านใหม่ (ไม่เปลี่ยนให้เว้นว่าง)' : 'Password'} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Field label="เบอร์โทร" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <label className="block"><span className="label">สิทธิ์</span><select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="employee">employee</option><option value="owner">owner</option></select></label>
          <div className="flex gap-2 md:items-end">
            <button className="btn-primary flex-1">{editing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}</button>
            {editing && <button type="button" className="btn-soft" onClick={() => { setEditing(null); setForm(blank); }}>ยกเลิก</button>}
          </div>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <div key={user.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-slate-950">{user.name || user.username}</h3>
                <p className="truncate text-sm font-bold text-slate-400">@{user.username}</p>
              </div>
              <span className={user.role === 'owner' ? 'badge-blue' : 'badge-green'}><ShieldCheck size={13} /> {user.role}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm font-bold text-slate-500">
              <p>โทร: {user.phone || '-'}</p>
              <p>สถานะ: {String(user.is_active) === '0' ? 'ปิดใช้งาน' : 'ใช้งาน'}</p>
            </div>
            <div className="mt-4 flex gap-2"><button className="btn-soft flex-1" onClick={() => startEdit(user)}><Edit size={16} /> แก้ไข</button><button className="btn-danger flex-1" onClick={() => remove(user)}><Trash2 size={16} /> ปิด</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return <label className="block"><span className="label">{label}</span><input required={required} type={type} className="input mt-1" value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>;
}
