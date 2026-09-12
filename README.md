# SWT Oil Management — v44 Render Vite Permission Fix

เวอร์ชันนี้ยึด UI จาก v43/v40 และแก้ปัญหา Render ขึ้น `sh: 1: vite: Permission denied`

สิ่งที่แก้เพิ่ม:
- เปลี่ยน build script จาก `vite build` เป็น `node ./node_modules/vite/bin/vite.js build`
- เพิ่ม `.gitignore` กัน `node_modules` ถูกอัปขึ้น GitHub
- ลบ `frontend/node_modules` ออกจากชุดดาวน์โหลด เพื่อให้ Render ติดตั้งใหม่เองบน Linux
- เพิ่ม `frontend/.node-version` เป็น Node 20
- แก้ `render.yaml` ฝั่ง frontend ให้ build แบบไม่พึ่ง permission ของไฟล์ binary

Render Frontend แนะนำตั้งค่า:
- Root Directory: `frontend`
- Build Command: `npm ci --no-audit --no-fund && node ./node_modules/vite/bin/vite.js build`
- Publish Directory: `dist`

หลัง Push เสร็จ ให้กด `Manual Deploy > Clear build cache & deploy`

---

# SWT Oil Management — v43 Manual Receipt Save + Smart Date UI

ฐานหลัก: v40 Mobile App UI Professional

สิ่งที่ปรับใน v43:

- ยกเลิกการบันทึกรูปใบสรุปอัตโนมัติหลังบันทึกรายการ เพื่อลดปัญหาเครื่อง/เบราว์เซอร์บล็อกการดาวน์โหลด
- หลังบันทึกสำเร็จยังเปิด Pop-up ใบสรุปให้ทันที แต่ให้ผู้ใช้กดปุ่ม **บันทึกรูป PNG เข้าเครื่อง** เอง
- เพิ่ม SweetAlert หลังผู้ใช้กดบันทึกรูปสำเร็จ
- ปรับช่องวันที่/เวลาในหน้าบันทึกงานให้ใช้งานง่ายขึ้น มีการ์ดวันที่ ปุ่ม วันนี้ / เมื่อวาน / ล้าง และเวลาเติมแบบกดเวลาปัจจุบันได้
- ยังคง UI หลักของ v40 ที่ผ่านแล้วไว้ ไม่เปลี่ยนโครงใหญ่
- ระบบคำนวณล่าสุดยังอยู่ครบ: จำนวนลิตรกรอกเอง, จำนวนบาท = ลิตร × ราคาลิตรละ, กม./ลิตร = ระยะทาง ÷ ลิตร

หมายเหตุ: เว็บมือถือไม่สามารถบันทึกเข้าคลังรูปแบบเงียบ ๆ ได้ทุกเครื่อง จึงเปลี่ยนเป็นปุ่มบันทึกรูปที่ผู้ใช้กดเอง เพื่อเสถียรกว่าและลดปัญหาบน iPhone/Android/In-app browser
