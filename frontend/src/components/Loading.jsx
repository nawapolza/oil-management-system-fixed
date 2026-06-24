export default function Loading({ text = 'กำลังโหลดข้อมูล...' }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center text-slate-500">
      <div className="card px-6 py-5 text-center">
        <div className="mx-auto mb-3 h-12 w-12 overflow-hidden rounded-2xl bg-white p-1 shadow ring-1 ring-blue-100">
          <img src="/logo-swt.png" alt="SWT" className="h-full w-full object-contain" />
        </div>
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="text-sm font-bold">{text}</p>
      </div>
    </div>
  );
}
