# MUNMUN CLINIC MANAGEMENT SYSTEM

MVP เว็บไซต์บริหารคลินิกบน **GitHub Pages + Supabase** รองรับมือถือและคอมพิวเตอร์: Login, Dashboard, ลูกค้า, นัดหมาย, แพทย์ และ RBAC/RLS

**สถานะ:** โค้ดถูกอัปโหลดแล้ว แต่ยังต้องตั้งค่า Supabase และ GitHub Pages จึงจะใช้งานได้ ห้ามกรอกข้อมูลคนไข้จริงในระหว่างทดสอบ

## ขั้นตอนติดตั้ง (ทำตามลำดับ)

### 1. Supabase
1. เปิด https://supabase.com/dashboard สร้าง **New project** (ใช้โปรเจกต์ว่างได้)
2. เปิด **SQL Editor > New query** วางไฟล์ [supabase/schema.sql](supabase/schema.sql) ทั้งไฟล์แล้วกด Run
3. ตรวจสอบว่ามี `staff_profiles`, `clients`, `appointments` และเปิด Row Level Security (SQL ตั้งค่าไว้แล้ว)
4. เปิด **Authentication > Providers > Email** และปิดการสมัครสาธารณะ (disable sign-ups) เพื่อไม่ให้บุคคลภายนอกสร้างบัญชีเอง
5. เปิด **Authentication > Users > Add user** สร้างบัญชีผู้บริหารพร้อมรหัสผ่านรัดกุม

### 2. กำหนด Admin คนแรก
ใน Supabase **SQL Editor** ให้รันคำสั่งด้านล่าง **หลังสร้างบัญชี Auth แล้ว** โดยเปลี่ยนอีเมล:

```sql
insert into public.staff_profiles (user_id, display_name, role)
select id, 'ผู้ดูแลระบบ', 'admin'
from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do update
set role = 'admin', display_name = excluded.display_name, active = true;
```

ตรวจสอบ: `select display_name,role,active from public.staff_profiles;` ต้องมี 1 แถว role admin

### 3. เชื่อมเว็บไซต์กับ Supabase
1. Supabase > **Project Settings > API** (หรือเมนู Connect)
2. คัดลอก **Project URL** (`https://xxxx.supabase.co`) และ **Publishable key** หรือ legacy **anon key**
3. GitHub เปิด [config.js](config.js) กดแก้ไข แล้วเปลี่ยน `YOUR_SUPABASE_PROJECT_URL` และ `YOUR_SUPABASE_PUBLISHABLE_KEY` เป็นค่าจริง กด Commit
4. **ห้าม** ใส่ service_role key, secret key, database password, หรือข้อมูลคนไข้ไว้ใน GitHub แม้เป็น private repository

### 4. เปิดเว็บไซต์ GitHub Pages
1. เปิด https://github.com/copyggolf/mummun/settings/pages
2. เลือก **Build and deployment > Deploy from a branch**
3. เลือก `main` และ `/(root)` แล้ว Save
4. เมื่อ deploy สำเร็จ URL ที่คาดว่าจะได้: **https://copyggolf.github.io/mummun/**
5. Login ด้วยบัญชี Admin แล้วทดสอบเพิ่มลูกค้า เพิ่มนัดหมาย และรีเฟรชดูว่าข้อมูลยังอยู่

## ระบบที่มีใน MVP
- **Dashboard:** ลูกค้าทั้งหมด, นัดหมายทั้งหมด, นัดหมายวันนี้ (เวลาไทย), นัดหมายรอดำเนินการ, รายการนัดถัดไป
- **ลูกค้า:** เพิ่ม แก้ไข ค้นหา และบันทึกลง Supabase
- **นัดหมาย:** เพิ่ม แก้ไข เลือกแพทย์/เวลา/บริการ/สถานะ และบันทึกลง Supabase
- **Admin:** ดูรายชื่อและบทบาทพนักงาน
- **สิทธิ์:** admin เห็นทั้งหมด, receptionist อ่าน/เพิ่ม/แก้ไขลูกค้าและนัดหมาย, doctor อ่านเฉพาะนัดตัวเองและลูกค้าที่มีนัดกับตน (บังคับโดย RLS ไม่ใช่แค่ปุ่มหน้าเว็บ)

### เพิ่มพนักงาน
สร้างบัญชีใหม่ใน **Supabase > Authentication > Users > Add user** แล้วกำหนด role ผ่าน SQL Editor โดยเปลี่ยน UUID:

```sql
insert into public.staff_profiles (user_id, display_name, role, active)
values ('UUID_FROM_AUTH_USERS', 'ชื่อพนักงาน', 'receptionist', true);
```

role ที่ใช้ได้: `admin`, `receptionist`, `doctor`. สำหรับผู้ใช้ใหม่แต่ละคนต้องมีบัญชี Auth จริงก่อน

## ข้อจำกัดและความปลอดภัย
- นี่คือ MVP เพื่อทดสอบด้วย **ข้อมูลสมมติเท่านั้น** ยังไม่ผ่าน security/PDPA review สำหรับข้อมูลสุขภาพจริง
- **อย่าเก็บเวชระเบียน การวินิจฉัย รูปใบหน้า หมายเลขบัตรประชาชน หรือข้อมูลสุขภาพอ่อนไหว** ใน MVP นี้
- ยังไม่มีรายรับรายจ่าย, สต๊อก, consent, audit logs, MFA enforcement, backup validation, pagination (รายการจำกัด 500), ป้องกันคิวซ้อน, และ automated tests
- ก่อนใช้จริง: ตรวจสอบ RLS สำหรับทุกบทบาท, MFA สำหรับเจ้าหน้าที่, audit logs, นโยบายเก็บ/ลบข้อมูล, การสำรองและกู้คืน, และข้อกำหนด PDPA
- Publishable/anon key ใช้ใน frontend ได้ **เฉพาะเมื่อกำหนด RLS ถูกต้อง**; ห้ามใช้ service_role key ใน browser
- GitHub Pages เป็นเพียง static host ส่วนฐานข้อมูลและ Auth อยู่ที่ Supabase

## Troubleshooting
- หน้าเว็บขึ้นตั้งค่า: ตรวจสอบ `config.js`
- Login ไม่ผ่าน: ตรวจสอบ Auth Users / รหัสผ่าน / bootstrap admin
- Permission denied: รัน `schema.sql` และตรวจสอบ Policies
- 404: ตรวจสอบ Settings > Pages เปิด main/(root) และ deploy สำเร็จ

Repository: https://github.com/copyggolf/mummun
