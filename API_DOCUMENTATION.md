# 📚 دليل توثيق واجهة برمجة التطبيقات — UltraSoft API Documentation
> **الإصدار**: `v1.0.0`  
> **تاريخ التحديث**: سبتمبر 2026  
> **البروتوكول**: HTTPS REST / JSON (مبني على Supabase RPC السحابي الآمن)  
> **العزل والأمان**: عزل مشفر متعدد المستأجرين (Cryptographic Multi-Tenant Isolation)

---

## 📑 الفهرس (Table of Contents)
1. [نظرة عامة على المحرك البرمجي](#1-نظرة-عامة-على-المحرك-البرمجي)
2. [المصادقة والأمان (Authentication & Security)](#2-المصادقة-والأمان-authentication--security)
3. [الترويسات الإجبارية (Required Headers)](#3-الترويسات-الإجبارية-required-headers)
4. [مصفوفة الصلاحيات (Permissions Matrix)](#4-مصفوفة-الصلاحيات-permissions-matrix)
5. [نقاط النهاية البرمجية (API Endpoints)](#5-نقاط-النهاية-البرمجية-api-endpoints)
   - [5.1 جلب الموديلات والأسعار (api_v1_get_models)](#51-جلب-الموديلات-والأسعار-api_v1_get_models)
   - [5.2 جلب أرصدة المخزون اللحظية (api_v1_get_stock)](#52-جلب-أرصدة-المخزون-اللحظية-api_v1_get_stock)
   - [5.3 جلب الفواتير والمبيعات مع الأصناف (api_v1_get_orders)](#53-جلب-الفواتير-والمبيعات-مع-الأصناف-api_v1_get_orders)
   - [5.4 مزامنة وتحديث المخزون من الـ ERP (api_v1_update_stock)](#54-مزامنة-وتحديث-المخزون-من-الـ-erp-api_v1_update_stock)
6. [رموز الاستجابة ومعالجة الأخطاء (Error Handling)](#6-رموز-الاستجابة-ومعالجة-الأخطاء-error-handling)
7. [أمثلة كود برمجية للربط (Code Samples)](#7-أمثلة-كود-برمجية-للربط-code-samples)
   - [cURL](#curl)
   - [Python](#python)
   - [Node.js / JavaScript](#nodejs--javascript)
   - [C# (.NET / Desktop ERPs)](#c-net--desktop-erps)
   - [PHP](#php)
8. [أفضل الممارسات للربط مع أنظمة المصانع (Best Practices)](#8-أفضل-الممارسات-للربط-مع-أنظمة-المصانع-best-practices)

---

## 1. نظرة عامة على المحرك البرمجي

يوفر **UltraSoft API Engine** واجهة برمجة تطبيقات فائقة السرعة تتيح لمصانع الملابس وشركات الإنتاج ربط أنظمتها الداخلية وبرامج الـ ERP (مثل: Odoo, SAP, Crystal, Onyx Pro، والبرامج المحلية المبنية بـ C# أو PHP) مع منصة UltraSoft مباشرة.

### ✨ مميزات المحرك:
- **تحديثات لحظية**: مزامنة حركة المخزون والمبيعات فور حدوثها.
- **عزل صارم للبيانات**: لا يمكن لأي مصنع الوصول لبيانات مصنع آخر حتى وإن استُخدمت نفس نقاط النهاية؛ حيث يتم التحقق من هوية المصنع من تجزئة مفتاح الـ API داخل بيئة قاعدة البيانات المعزولة.
- **دعم نظام الخصومات والتصنيفات الجديدة**: يدعم أسعار الخصم وحساب التوفير، وتصنيف 1، وتصنيف 2، والفئات العمرية.

---

## 2. المصادقة والأمان (Authentication & Security)

تعتمد جميع الطلبات على **مفتاح API سري** يتم استخراجه من لوحة تحكم الأدمن:  
`لوحة التحكم > الإعدادات المتقدمة > مفاتيح الربط البرمجي (API Settings)`.

### معايير الأمان المتبعة:
1. **تنسيق المفتاح**: يبدأ دائماً بالبادئة `us_live_` متبوعاً بسلسلة عشوائية آمنة مشفرة بطول 48 حرفاً.
2. **تجزئة SHA-256**: لا يتم تخزين المفتاح الأصلي في قاعدة البيانات نهائياً كنص عادي، بل يُخزن Hash تجزئة `SHA-256` فقط.
3. **عرض لمرة واحدة**: يظهر المفتاح للمستخدم لمرة واحدة فقط عند الإنشاء، مع إمكانية إلغاء تفعيله أو حذفه في أي وقت.

---

## 3. الترويسات الإجبارية (Required Headers)

جميع الطلبات تكون من نوع `POST` وتتطلب الترويسات التالية:

```http
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

> ⚠️ **ملاحظة**: قيمة `apikey` و `Authorization` هي المفتاح العام للمشروع (Supabase Anon Key)، بينما مفتاح المصنع الخاص بك (`us_live_...`) يُرسل داخل جسم الطلب (Request Body) كمعامل باسم `p_api_key`.

* عنوان الخدمة الأساسي (Base URL):
```text
https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc
```

---

## 4. مصفوفة الصلاحيات (Permissions Matrix)

لكل مفتاح API مصفوفة صلاحيات محددة يمكن تفعيلها أو إيقافها:

| كود الصلاحية | الوصف | نقاط النهاية المرتبطة |
|---|---|---|
| `models:read` | قراءة بيانات الموديلات والأسعار والخصومات والتصنيفات | `api_v1_get_models` |
| `stock:read` | استعراض الأرصدة المتوفرة بالسيريهات والألوان | `api_v1_get_stock` |
| `orders:read` | قراءة الفواتير والمبيعات مع تفاصيل الأصناف | `api_v1_get_orders` |
| `stock:write` | تعديل وتحديث أرصدة المخزون من الـ ERP | `api_v1_update_stock` |

---

## 5. نقاط النهاية البرمجية (API Endpoints)

---

### 5.1 جلب الموديلات والأسعار (`api_v1_get_models`)

تسترجع قائمة بجميع الموديلات المعرفة للمصنع مع تفاصيل الأسعار والخصومات والتصنيفات.

- **الرابط**: `POST /rest/v1/rpc/api_v1_get_models`
- **الصلاحية المطلوبة**: `models:read`

#### المعاملات (Payload Parameters):
| المعامل | النوع | إجباري؟ | الافتراضي | الوصف |
|---|---|---|---|---|
| `p_api_key` | `string` | **نعم** | - | مفتاح الـ API السري الخاص بالمصنع |
| `p_active_only` | `boolean` | لا | `true` | جلب الموديلات النشطة فقط (أو `false` لجلب الكل) |
| `p_limit` | `integer` | لا | `100` | الحد الأقصى للموديلات (الحد الأقصى 500) |
| `p_offset` | `integer` | لا | `0` | عدد الموديلات المراد تخطيها (للصفحات) |

#### مثال الطلب (Request Example):
```json
{
  "p_api_key": "us_live_34428aa218f7734bbd89...",
  "p_active_only": true,
  "p_limit": 50,
  "p_offset": 0
}
```

#### مثال الاستجابة (Response Example):
```json
{
  "status": "success",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "count": 1,
  "models": [
    {
      "id": "6752be73-1f8c-47ec-a34f-6d230e4b5793",
      "name": "قميص شبابي كم تطريزه بي اكسفورد",
      "system_code": "2378",
      "factory_code": "5898",
      "price": 310,
      "discount_price": 210,
      "has_discount": true,
      "category": "قمصان كاجوال",
      "classification_1": "صيف 2026",
      "classification_2": "أقطان معالجة",
      "age_class": "شبابي",
      "is_active": true,
      "created_at": "2026-09-15T08:28:10.841482+00:00"
    }
  ]
}
```

---

### 5.2 جلب أرصدة المخزون اللحظية (`api_v1_get_stock`)

تسترجع الأرصدة اللحظية المتاحة بالسيريهات لكل موديل ولكل لون على حدة.

- **الرابط**: `POST /rest/v1/rpc/api_v1_get_stock`
- **الصلاحية المطلوبة**: `stock:read`

#### المعاملات (Payload Parameters):
| المعامل | النوع | إجباري؟ | الافتراضي | الوصف |
|---|---|---|---|---|
| `p_api_key` | `string` | **نعم** | - | مفتاح الـ API السري الخاص بالمصنع |
| `p_model_id` | `uuid` | لا | `null` | لتصفية المخزون لموديل محدد (اتركه فارغاً لجلب كل الموديلات) |

#### مثال الطلب (Request Example):
```json
{
  "p_api_key": "us_live_34428aa218f7734bbd89...",
  "p_model_id": null
}
```

#### مثال الاستجابة (Response Example):
```json
{
  "status": "success",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "inventory": [
    {
      "model_id": "8ca17aee-c1a5-431e-ba52-8df769e01239",
      "model_name": "اكسفورد تومي",
      "system_code": "3",
      "factory_code": "63",
      "color_id": "0242aad1-4c38-4625-a0a8-f06d702ae66a",
      "color_name": "الاسود",
      "available_series": 66,
      "color_system_code": "3-BLK",
      "color_factory_code": "63-B"
    }
  ]
}
```

---

### 5.3 جلب الفواتير والمبيعات مع الأصناف (`api_v1_get_orders`)

تسترجع أحدث الفواتير والمبيعات المسجلة في المعرض الإلكتروني مع تفاصيل العميل والعربون، بالإضافة إلى مصفوفة كاملة بالأصناف المضمنة في كل فاتورة (`items`).

- **الرابط**: `POST /rest/v1/rpc/api_v1_get_orders`
- **الصلاحية المطلوبة**: `orders:read`

#### المعاملات (Payload Parameters):
| المعامل | النوع | إجباري؟ | الافتراضي | الوصف |
|---|---|---|---|---|
| `p_api_key` | `string` | **نعم** | - | مفتاح الـ API السري الخاص بالمصنع |
| `p_limit` | `integer` | لا | `50` | الحد الأقصى للفواتير (الحد الأقصى 200) |
| `p_offset` | `integer` | لا | `0` | تخطي عدد محدد من الفواتير (Pagination) |

#### مثال الطلب (Request Example):
```json
{
  "p_api_key": "us_live_34428aa218f7734bbd89...",
  "p_limit": 20,
  "p_offset": 0
}
```

#### مثال الاستجابة (Response Example):
```json
{
  "status": "success",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "count": 1,
  "orders": [
    {
      "id": "e81d7f44-8664-442b-b6cb-a31cfb5fef79",
      "invoice_number": 4,
      "customer_name": "احمد السيد",
      "phone_1": "01012345678",
      "phone_2": "01198765432",
      "address": "القاهرة - العتبة",
      "total_price": 8390,
      "deposit": 1000,
      "total_series": 15,
      "status": "completed",
      "notes": "تسليم مكتب شحن الرويعي",
      "created_at": "2026-09-16T08:15:30.000Z",
      "items": [
        {
          "model_id": "8ca17aee-c1a5-431e-ba52-8df769e01239",
          "model_name": "اكسفورد تومي",
          "system_code": "3",
          "factory_code": "63",
          "color_name": "الاسود",
          "quantity_series": 5,
          "piece_price": 310,
          "price_per_series": 1240,
          "total_price": 6200
        }
      ]
    }
  ]
}
```

---

### 5.4 مزامنة وتحديث المخزون من الـ ERP (`api_v1_update_stock`)

تتيح لبرنامج الـ ERP الخاص بالمصنع إرسال تحديثات الأرصدة إلى UltraSoft مباشرة عند تصنيع دفعات جديدة أو عند بيع كميات خارج الموقع. يتم إجراء العملية بنظام `Upsert` ذكي مع التحقق التلقائي من ملكية الموديل لنفس المصنع.

- **الرابط**: `POST /rest/v1/rpc/api_v1_update_stock`
- **الصلاحية المطلوبة**: `stock:write`

#### المعاملات (Payload Parameters):
| المعامل | النوع | إجباري؟ | الوصف |
|---|---|---|---|
| `p_api_key` | `string` | **نعم** | مفتاح الـ API السري الخاص بالمصنع |
| `p_model_id` | `uuid` | **نعم** | معرف الموديل (UUID) |
| `p_color_id` | `uuid` | **نعم** | معرف اللون (UUID) |
| `p_new_series` | `integer` | **نعم** | الرصيد الجديد بعدد السيريهات (أكبر من أو يساوي 0) |

#### مثال الطلب (Request Example):
```json
{
  "p_api_key": "us_live_34428aa218f7734bbd89...",
  "p_model_id": "8ca17aee-c1a5-431e-ba52-8df769e01239",
  "p_color_id": "0242aad1-4c38-4625-a0a8-f06d702ae66a",
  "p_new_series": 50
}
```

#### مثال الاستجابة (Response Example):
```json
{
  "status": "success",
  "model_id": "8ca17aee-c1a5-431e-ba52-8df769e01239",
  "color_id": "0242aad1-4c38-4625-a0a8-f06d702ae66a",
  "available_series": 50
}
```

---

## 6. رموز الاستجابة ومعالجة الأخطاء (Error Handling)

تُرجع دوال الـ API أخطاء واضحة مصحوبة برمز الحالة ورسالة تفصيلية:

| رمز الخطأ | المعنى | سبب الخطأ الشائع |
|---|---|---|
| `401 Unauthorized` | غير مصرح | المفتاح المرسل غير صالح أو مفقود أو أقل من 16 حرفاً |
| `403 Forbidden` | تم رفض الوصول | تم إلغاء تفعيل المفتاح من لوحة التحكم، أو المفتاح يفتقر إلى الصلاحية المطلوبة (مثل استدعاء `update_stock` بمفتاح ليس لديه `stock:write`) |
| `404 Not Found` | غير موجود | الموديل المطلوب غير موجود أو يتبع مصنعاً آخر |
| `400 Bad Request` | خطأ في المدخلات | نقص في الحقول الإجبارية أو إرسال قيم غير متوافقة |

#### نموذج استجابة الخطأ (Error Body Example):
```json
{
  "code": "P0001",
  "details": null,
  "hint": null,
  "message": "403: Forbidden - API key lacks permission: stock:write"
}
```

---

## 7. أمثلة كود برمجية للربط (Code Samples)

### cURL

```bash
curl -X POST "https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc/api_v1_get_models" \
  -H "Content-Type: application/json" \
  -H "apikey: sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV" \
  -H "Authorization: Bearer sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV" \
  -d '{
    "p_api_key": "us_live_YOUR_SECRET_API_KEY",
    "p_active_only": true,
    "p_limit": 10
  }'
```

---

### Python

```python
import requests

BASE_URL = "https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc"
ANON_KEY = "sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV"
API_KEY  = "us_live_YOUR_SECRET_API_KEY"

headers = {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}"
}

# 1. جلب الموديلات والأسعار
payload = {
    "p_api_key": API_KEY,
    "p_active_only": True,
    "p_limit": 25
}

response = requests.post(f"{BASE_URL}/api_v1_get_models", json=payload, headers=headers)
if response.status_code == 200:
    data = response.json()
    print(f"تم جلب {len(data.get('models', []))} موديل بنجاح:")
    for model in data.get("models", []):
        price_info = f"{model['discount_price']} ج.م (خصم)" if model['has_discount'] else f"{model['price']} ج.م"
        print(f"- {model['name']} | كود مصنع: {model['factory_code']} | السعر: {price_info}")
else:
    print(f"حدث خطأ ({response.status_code}): {response.text}")
```

---

### Node.js / JavaScript

```javascript
import fetch from 'node-fetch'; // أو استخدام fetch المدمج في Node 18+

const BASE_URL = 'https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc';
const ANON_KEY = 'sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV';
const API_KEY  = 'us_live_YOUR_SECRET_API_KEY';

async function fetchLatestOrders() {
    const response = await fetch(`${BASE_URL}/api_v1_get_orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify({
            p_api_key: API_KEY,
            p_limit: 10
        })
    });

    if (!response.ok) {
        throw new Error(`API Error: ${await response.text()}`);
    }

    const data = await response.json();
    console.log(`تم جلب ${data.orders.length} فاتورة بنجاح:`);
    data.orders.forEach(order => {
        console.log(`فاتورة #${order.invoice_number} | العميل: ${order.customer_name} | الإجمالي: ${order.total_price} ج.م`);
    });
}

fetchLatestOrders().catch(console.error);
```

---

### C# (.NET / Desktop ERPs)

أغلب برامج المصانع المكتبية (Desktop ERPs) مبنية بـ C# أو VB.NET:

```csharp
using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json; // أو System.Text.Json

class UltraSoftClient
{
    private static readonly HttpClient client = new HttpClient();
    private const string BaseUrl = "https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc";
    private const string AnonKey = "sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV";
    private const string MyApiKey = "us_live_YOUR_SECRET_API_KEY";

    public static async Task SyncStock(string modelId, string colorId, int newSeries)
    {
        var url = $"{BaseUrl}/api_v1_update_stock";
        
        var requestData = new
        {
            p_api_key = MyApiKey,
            p_model_id = modelId,
            p_color_id = colorId,
            p_new_series = newSeries
        };

        var content = new StringContent(JsonConvert.SerializeObject(requestData), Encoding.UTF8, "application/json");
        
        var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("apikey", AnonKey);
        request.Headers.Add("Authorization", $"Bearer {AnonKey}");
        request.Content = content;

        var response = await client.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (response.IsSuccessStatusCode)
        {
            Console.WriteLine("تم تحديث المخزون في UltraSoft بنجاح: " + responseBody);
        }
        else
        {
            Console.WriteLine("خطأ في المزامنة: " + responseBody);
        }
    }
}
```

---

### PHP

```php
<?php

$baseUrl = "https://huyzroaqvzbwhenilpjh.supabase.co/rest/v1/rpc/api_v1_get_stock";
$anonKey = "sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV";
$apiKey  = "us_live_YOUR_SECRET_API_KEY";

$data = [
    "p_api_key" => $apiKey
];

$ch = curl_init($baseUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "apikey: " . $anonKey,
    "Authorization: Bearer " . $anonKey
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
    $result = json_decode($response, true);
    echo "إجمالي بنود المخزون المتاحة: " . count($result['inventory']);
} else {
    echo "حدث خطأ: " . $response;
}
```

---

## 8. أفضل الممارسات للربط مع أنظمة المصانع (Best Practices)

1. **حفظ المفتاح السري**: احتفظ بمفتاح الـ API في ملف متغيرات بيئة (`.env`) أو داخل إعدادات مشفرة في برنامج الـ ERP، ولا تشاركه أبداً في الواجهات الأمامية العامة للعملاء.
2. **استخدام مبدأ الحد الأدنى من الصلاحيات (Least Privilege)**: إذا كان النظام الخارجي يحتاج فقط لقراءة الأرصدة لعرضها، قم بإنشاء مفتاح بصلاحية `stock:read` فقط، ولا تمنحه صلاحية `stock:write` أو `orders:read`.
3. **المزامنة الدورية (Polling Intervals)**: في حال قراءة المخزون أو الفواتير بصفة دورية، يُفضل ضبط الجدولة (Cron Job) كل 5 أو 10 دقائق لتجنب استهلاك معدل الطلبات دون داعٍ.
4. **تحديث المخزون بالحدث (Event-Driven Updates)**: بدلاً من إرسال كامل جدول المخزون بشكل دوري، اجعل برنامج الـ ERP يُرسل استدعاء `api_v1_update_stock` فقط عند حدوث حركة فعلية (مثل إصدار إذن صرف أو إضافة دفعة إنتاجية للموديل).
5. **معالجة الاستثناءات والقطع**: تأكد دائماً من فحص حالة الاستجابة (`HTTP Status Code`) للتعامل مع أي انقطاع مؤقت في الاتصال بالإنترنت وإعادة المحاولة التلقائية (Retry with Exponential Backoff).

---

> 💡 **الدعم الفني للمطورين**: تم تصميم وتطوير هذا المحرك ليتناسب مع كافة أنظمة إدارة الموارد (ERPs) الحديثة والقديمة. لأي استفسارات أو طلب نقاط نهاية إضافية مخصصة، يرجى التواصل مع الدعم الفني لمنصة UltraSoft.
