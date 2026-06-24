import { Bell, Boxes, Car, ClipboardList, Gauge, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { confirmAction } from '../utils/alerts.js';

const navBase = [
  { key: 'dashboard', label: 'Dashboard เจ้าของ', short: 'แดชบอร์ด', icon: Gauge, ownerOnly: true },
  { key: 'quick', label: 'บันทึกงาน', short: 'บันทึก', icon: ClipboardList },
  { key: 'deliveries', label: 'รายการข้อมูล', short: 'รายการ', icon: ClipboardList },
  { key: 'stocks', label: 'เติมสต๊อก', short: 'สต๊อก', icon: Boxes, ownerOnly: true },
  { key: 'vehicles', label: 'รถ / คนขับรถ', short: 'รถ', icon: Car, ownerOnly: true },
  { key: 'users', label: 'คน / พนักงาน', short: 'คน', icon: Users, ownerOnly: true },
  { key: 'notifications', label: 'แจ้งเตือน', short: 'เตือน', icon: Bell, ownerOnly: true },
];

function detectRealMobile() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Line|FBAN|FBAV/i.test(ua);
  const touchSmall = navigator.maxTouchPoints > 1 && Math.min(window.screen.width || 0, window.innerWidth || 0) <= 900;
  return mobileUa || touchSmall;
}

export default function Layout({ page, setPage, children }) {
  const { user, logout, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [forceMobile, setForceMobile] = useState(false);
  const [bottomVisible, setBottomVisible] = useState(true);
  const scrollTimerRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const navItems = navBase.filter((item) => !item.ownerOnly || isOwner);

  useEffect(() => {
    const mobile = detectRealMobile();
    setForceMobile(mobile);
    document.documentElement.dataset.device = mobile ? 'mobile' : 'desktop';
  }, []);

  useEffect(() => {
    if (!forceMobile) return undefined;

    let lastKnownY = window.scrollY || 0;
    lastScrollYRef.current = lastKnownY;

    const hideMenuForCapture = () => {
      const currentY = window.scrollY || 0;
      const moved = Math.abs(currentY - lastKnownY);
      lastKnownY = currentY;
      lastScrollYRef.current = currentY;
      if (moved > 2) {
        setBottomVisible(false);
      }
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        // คงเมนูด้านล่างไว้แบบซ่อนหลังเลื่อน เพื่อให้แคปใบสรุปได้ไม่ติดเมนู
        setBottomVisible(false);
      }, 220);
    };

    const showMenuOnUserTap = (event) => {
      const target = event.target;
      if (target?.closest?.('.mobile-bottom-nav')) return;
      setBottomVisible(true);
    };

    window.addEventListener('scroll', hideMenuForCapture, { passive: true });
    window.addEventListener('touchmove', hideMenuForCapture, { passive: true });
    document.addEventListener('pointerdown', showMenuOnUserTap, { passive: true });

    return () => {
      window.removeEventListener('scroll', hideMenuForCapture);
      window.removeEventListener('touchmove', hideMenuForCapture);
      document.removeEventListener('pointerdown', showMenuOnUserTap);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    };
  }, [forceMobile]);

  async function doLogout() {
    const ok = await confirmAction('ออกจากระบบ?', 'ต้องการออกจากระบบตอนนี้ใช่ไหม');
    if (ok) logout();
  }

  function go(key) {
    setPage(key);
    setOpen(false);
    setBottomVisible(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const mobileHeaderClass = forceMobile ? 'block' : 'md:hidden';
  const desktopAsideClass = forceMobile ? 'hidden' : 'hidden md:block';
  const mainClass = forceMobile
    ? 'mx-auto max-w-[560px] px-3 py-4'
    : 'mx-auto max-w-7xl px-3 py-4 md:ml-80 md:px-8 md:py-8';
  const mobileBottomClass = forceMobile ? 'flex' : 'flex md:hidden';
  const bottomStateClass = bottomVisible ? 'is-visible' : 'is-hidden';

  return (
    <div className="min-h-screen mobile-safe-bottom md:pb-0">
      <header className={`sticky top-0 z-40 border-b border-white/70 bg-white/92 shadow-sm backdrop-blur-xl ${mobileHeaderClass}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => go(isOwner ? 'dashboard' : 'quick')}>
            <div className="brand-logo-mobile">
              <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wide text-teal-600">SWT Transport</p>
              <h1 className="truncate text-base font-black leading-tight text-slate-950">ระบบน้ำมันมือถือ</h1>
            </div>
          </button>
          <button className="btn-soft !min-h-0 !rounded-2xl !p-3" onClick={() => setOpen((v) => !v)} aria-label="menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {open && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
            {navItems.map((item) => <NavButton key={item.key} item={item} active={page === item.key} onClick={() => go(item.key)} />)}
            <button onClick={doLogout} className="col-span-2 btn-soft justify-start"><LogOut size={18} /> ออกจากระบบ</button>
          </div>
        )}
      </header>

      <aside className={`fixed inset-y-0 left-0 z-30 w-80 overflow-y-auto bg-slate-950 p-4 text-white ${desktopAsideClass}`}>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-sky-500 to-teal-400 p-5 shadow-xl shadow-blue-950/30">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-xl" />
          <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-blue-900/20 blur-xl" />
          <div className="relative">
            <div className="brand-logo-desktop bg-white/95">
              <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
            </div>
            <p className="mt-5 text-sm font-bold text-blue-50">SWT Transport Oil</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">ระบบบันทึกน้ำมัน</h2>
            <div className="mt-5 rounded-3xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-bold text-blue-50">ผู้ใช้งานปัจจุบัน</p>
              <p className="mt-1 truncate text-lg font-black">{user?.name || user?.username}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-black">{isOwner ? 'OWNER' : 'EMPLOYEE'}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-black"><ShieldCheck size={12} /> พร้อมใช้งาน</span>
              </div>
            </div>
          </div>
        </div>
        <nav className="mt-5 space-y-2">
          {navItems.map((item) => <NavButton key={item.key} item={item} active={page === item.key} onClick={() => go(item.key)} desktop />)}
        </nav>
        <button onClick={doLogout} className="btn-ghost mt-4 w-full justify-start"><LogOut size={18} /> ออกจากระบบ</button>
      </aside>

      <main className={mainClass}>
        {children}
      </main>

      <nav className={`mobile-bottom-nav ${bottomStateClass} fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/94 px-3 pb-[max(.55rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_34px_rgba(15,23,42,.10)] backdrop-blur-xl ${mobileBottomClass}`} aria-label="เมนูด้านล่าง">
        <div className="mobile-bottom-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={`mobile-bottom-item ${page === item.key ? 'mobile-bottom-item-active' : 'mobile-bottom-item-normal'}`}
                title={item.label}
              >
                <Icon size={20} className="shrink-0" />
                <span className="whitespace-nowrap">{item.short}</span>
              </button>
            );
          })}
          <button onClick={doLogout} className="mobile-bottom-item mobile-bottom-logout" title="ออกจากระบบ">
            <LogOut size={20} className="shrink-0" />
            <span className="whitespace-nowrap">ออก</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function NavButton({ item, active, onClick, desktop = false }) {
  const Icon = item.icon;
  const activeClass = desktop ? 'bg-white text-slate-950 shadow-lg' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20';
  const normalClass = desktop ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100';
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${active ? activeClass : normalClass}`}>
      <Icon size={20} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
