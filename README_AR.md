# MZJ Haraj Manager — Vercel + GitHub + Firebase Spark

نسخة مستقلة لإدارة إعلانات حراج، بدون Firebase Functions وبدون Firebase Hosting.

## المعمارية

- **GitHub Private Repository**: حفظ السورس والإصدارات.
- **Vercel**: استضافة الواجهة وتشغيل `/api/stock` لقراءة الاستوك.
- **Firebase Authentication**: دخول المدير فقط `admin@mzj.com`.
- **Cloud Firestore**: حسابات حراج، المناديب، حصص الإعلانات، ربط السيارات، روابط الإعلانات والحالات.
- **MZJ Platform**: مصدر الاستوك فقط — قراءة فقط — لا يتم تعديل سورس المنصة.

لا يوجد:
- Firebase Functions
- Firebase Hosting
- Firebase Storage مطلوب
- قاعدة بيانات إضافية
- بيانات وهمية

## Firebase الجاهز

المشروع مضبوط على Firebase Web App:

- Project ID: `mzj-haraj-manager`
- Auth domain: `mzj-haraj-manager.firebaseapp.com`
- Admin: `admin@mzj.com`

إعداد Firebase Web App العام موجود في `src/firebase.ts`، وهذا طبيعي في تطبيقات Firebase Web. الحماية تعتمد على Auth + Firestore Rules.

### Firestore Rules

القواعد المطلوبة موجودة في `firestore.rules`، وهي تسمح فقط لـ:

`admin@mzj.com`

إذا كنت نشرتها بالفعل في Firebase فلا تحتاج لأي خطوة إضافية.

## قراءة الاستوك

Vercel API Route:

`GET /api/stock`

يقوم بالآتي:

1. يتحقق من Firebase ID Token للمدير.
2. يسجل دخول Server-to-Server إلى منصة MZJ.
3. يقرأ:

`/api/operations?resource=vehicles&status=available_for_sale&page=...&pageSize=200`

4. يستخدم فقط:
   - `car_name` = سيارة
   - `statement` = البيان
   - `model_year` = موديل
   - `status_name` / `status_code` = الحالة
5. الحالة المقبولة فقط: **متاح للبيع / available_for_sale**.
6. يجمع الاستوك حسب: **سيارة + البيان + الموديل** ويعرض الكمية.

## متغيرات Vercel المطلوبة

في Vercel افتح:

**Project → Settings → Environment Variables**

وأضف:

```env
MZJ_PLATFORM_BASE_URL=https://mzj-platform.vercel.app
MZJ_PLATFORM_IDENTIFIER=بيانات_دخول_مستخدم_المنصة
MZJ_PLATFORM_PASSWORD=كلمة_مرور_مستخدم_المنصة
```

`MZJ_PLATFORM_IDENTIFIER` يمكن أن يكون الإيميل أو الجوال أو رقم الموظف المستخدم للدخول إلى منصة MZJ، ويجب أن يكون الحساب لديه صلاحية رؤية **العمليات → مخزون السيارات** وحالة **متاح للبيع**.

لا تضع كلمة مرور المنصة داخل GitHub.

## الرفع على GitHub

أنشئ Repository جديد **Private**، وليكن مثلًا:

`mzj-haraj-manager`

من فولدر المشروع:

```bash
git init
git add .
git commit -m "MZJ Haraj Manager v1.1.0"
git branch -M main
git remote add origin https://github.com/YOUR-USER/mzj-haraj-manager.git
git push -u origin main
```

## الربط بـ Vercel

1. افتح Vercel.
2. **Add New → Project**.
3. اختر Repository الخاص بـ `mzj-haraj-manager`.
4. Vercel سيتعرف على Vite تلقائيًا.
5. قبل Deploy أضف Environment Variables الثلاثة المذكورة بالأعلى.
6. اضغط **Deploy**.

لا تضف Firebase Functions أو Firebase Hosting.

بعد كل Push جديد إلى `main`، Vercel يعمل Deploy تلقائيًا.

## الاستخدام

1. سجل الدخول بكلمة مرور Firebase الخاصة بـ `admin@mzj.com`.
2. أضف حسابات حراج وحدد عدد الإعلانات لكل حساب.
3. أضف المناديب وأرقامهم واربط كل مندوب بحسابه وحدد حصته.
4. صفحة **مخزون السيارات** تقرأ فقط السيارات `متاح للبيع` من منصة MZJ.
5. اختر السيارة المطلوب عمل إعلان لها واربطها بحساب حراج والمندوب.
6. بعد نشر الإعلان على حراج أضف رابط الإعلان.
7. من صفحة الإعلانات اضغط **فتح** لمراجعة الإعلان الحقيقي.
8. غيّر حالة الإعلان: مسند / تم النشر / معتمد / يحتاج تعديل / منتهي.

## ملاحظات مهمة

- السيارة تعتبر مغطاة إذا كان لها إعلان غير `منتهي` داخل النظام.
- لا يتم استنتاج حالة إعلان حراج تلقائيًا لأن لا يوجد API رسمي مربوط بحراج.
- كل أرقام الداشبورد من Firestore والاستوك الحقيقي فقط.
- بيانات دخول منصة MZJ لا تصل للمتصفح ولا تحفظ في Firestore.
