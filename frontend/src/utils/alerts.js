import Swal from 'sweetalert2';

export const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2400,
  timerProgressBar: true,
});

export function alertSuccess(title = 'สำเร็จ', text = '') {
  return Swal.fire({ icon: 'success', title, text, confirmButtonText: 'ตกลง', confirmButtonColor: '#2563eb' });
}

export function alertError(error, fallback = 'เกิดข้อผิดพลาด') {
  const message = typeof error === 'string' ? error : error?.message || fallback;
  return Swal.fire({ icon: 'error', title: 'ทำรายการไม่สำเร็จ', text: message, confirmButtonText: 'ตกลง', confirmButtonColor: '#dc2626' });
}

export function toastSuccess(title = 'บันทึกสำเร็จ') {
  return Toast.fire({ icon: 'success', title });
}

export function toastInfo(title = 'อัปเดตข้อมูลแล้ว') {
  return Toast.fire({ icon: 'info', title });
}

export async function confirmDanger(title = 'ยืนยันการลบ', text = 'เมื่อลบแล้วจะย้อนกลับไม่ได้') {
  const res = await Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    reverseButtons: true,
  });
  return res.isConfirmed;
}

export async function confirmAction(title = 'ยืนยันรายการ', text = '') {
  const res = await Swal.fire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: 'ตกลง',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    reverseButtons: true,
  });
  return res.isConfirmed;
}
