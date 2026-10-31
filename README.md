# ملاحظاتي — My Notes

تطبيق ملاحظات شخصي (SPA) يعتمد على `localStorage`، مع مصادقة بالبريد الإلكتروني وكلمة مرور، ودعم كامل لـ RTL.

## الميزات
- تسجيل دخول / إنشاء حساب (البيانات محفوظة محلياً)
- ملاحظات خاصة بكل مستخدم
- إنشاء، تعديل، حذف، تثبيت، تلوين
- بحث فوري
- حفظ تلقائي
- تصميم احترافي (RTL)

## إعداد Supabase
1. أنشئ مشروعاً في https://supabase.com
2. في SQL Editor، الصق محتوى `supabase.sql` وشغّله.
3. انسخ `Project URL` و `anon public key` من Project Settings -> API.
4. افتح `config.js` وضع القيم مكان `YOUR_PROJECT` و `YOUR_ANON_KEY`.
5. (اختياري) في Authentication -> URL Configuration أضف رابط GitHub Pages.

## التشغيل
افتح `index.html` في المتصفح. لا حاجة لخادم.

## النشر
GitHub Pages: https://ibnzkeer.github.io/mulahzaty/
