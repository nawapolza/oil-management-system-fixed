import { Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { alertError, toastSuccess } from '../utils/alerts.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      toastSuccess('เข้าสู่ระบบสำเร็จ');
    } catch (err) {
      alertError(err, 'เข้าสู่ระบบไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,.18),_transparent_28rem),linear-gradient(135deg,#020617_0%,#0f172a_48%,#f8fafc_48%,#ffffff_100%)] px-4 py-6 text-white md:grid md:place-items-center">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-10rem] h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-8rem] h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
      </div>
      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-slate-950/20 md:grid-cols-[.92fr_1fr]">
        <div className="hidden overflow-hidden bg-slate-950 p-8 md:flex md:flex-col md:justify-between">
          <div>
            <div className="login-logo-card">
              <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
            </div>
            <h1 className="mt-8 text-4xl font-black tracking-tight">SWT Oil Management</h1>
            <p className="mt-4 max-w-sm text-base font-semibold leading-7 text-slate-300">ระบบบันทึกน้ำมันสำหรับงานขนส่ง ออกแบบให้ใช้งานง่ายบนมือถือและคอมพิวเตอร์</p>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-sm font-bold leading-6 text-slate-200">
            <div className="mb-3 flex items-center gap-2 text-cyan-200"><ShieldCheck size={18} /> พร้อมใช้งานอย่างปลอดภัย</div>
            <p className="text-slate-400">เข้าสู่ระบบด้วยบัญชีที่ได้รับเท่านั้น ข้อมูลสำคัญถูกแยกสิทธิ์ตามผู้ใช้งาน</p>
          </div>
        </div>
        <div className="bg-white p-5 text-slate-950 md:p-10">
          <div className="mb-8 text-center md:text-left">
            <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-3xl bg-white p-1 shadow-lg ring-1 ring-slate-200 md:mx-0">
              <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
            </div>
            <h2 className="text-3xl font-black">เข้าสู่ระบบ</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเริ่มบันทึกข้อมูล</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="label">ชื่อผู้ใช้</span>
              <div className="input-icon-wrap mt-1">
                <span className="input-icon-left"><UserRound size={19} /></span>
                <input className="input input-has-left-icon" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="กรอกชื่อผู้ใช้" autoComplete="username" required />
              </div>
            </label>
            <label className="block">
              <span className="label">รหัสผ่าน</span>
              <div className="input-icon-wrap mt-1">
                <span className="input-icon-left"><LockKeyhole size={19} /></span>
                <input
                  className="input input-has-left-icon input-has-right-icon"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="input-icon-right-button focus:outline-none focus:ring-4 focus:ring-blue-100"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>
            <button disabled={loading} className="btn-primary w-full text-base">{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
          </form>
          <div className="mt-6 flex items-start gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-bold leading-6 text-emerald-800">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} />
            <span>ระบบจะแสดงเฉพาะเมนูที่บัญชีนี้ใช้งานได้</span>
          </div>
        </div>
      </div>
    </div>
  );
}

