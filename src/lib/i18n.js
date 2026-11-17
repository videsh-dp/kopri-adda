// ---------------------------------------------------------------------------
// Languages for the daily screens and the WhatsApp messages.
//
// English text is the key. A missing translation falls back to English, so
// the manager tools (Overview, All entries, Accounts, Year end, Reports,
// Settings) stay in English for now.
//
// Konkani is written in Devanagari (the official script in Goa). The
// Konkani, Marathi and Hindi wording below is a first draft and should be
// checked by a native speaker before wide use; Konkani most of all.
// ---------------------------------------------------------------------------

export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-IN" },
  { code: "kok", label: "कोंकणी (Konkani)", locale: "kok-IN" },
  { code: "mr", label: "मराठी (Marathi)", locale: "mr-IN" },
  { code: "hi", label: "हिंदी (Hindi)", locale: "hi-IN" },
];

const T = {
  // ------------------------------------------------------------ navigation
  Daily: { kok: "दिसपटें", mr: "रोजचे", hi: "रोज़ का" },
  "Manager tools": { kok: "व्यवस्थापकाचीं साधनां", mr: "व्यवस्थापकाची साधने", hi: "मैनेजर टूल्स" },
  Collect: { kok: "वसुली", mr: "वसुली", hi: "वसूली" },
  "Collect payments": { kok: "पयशे वसूल करात", mr: "पैसे वसूल करा", hi: "पैसे वसूल करें" },
  People: { kok: "लोक", mr: "लोक", hi: "लोग" },
  Loans: { kok: "कर्जां", mr: "कर्जे", hi: "कर्ज़" },
  "Deposit chart": { kok: "ठेव तक्तो", mr: "ठेव तक्ता", hi: "जमा चार्ट" },
  More: { kok: "आनीक", mr: "अधिक", hi: "और" },
  "Dark mode": { kok: "काळो मोड", mr: "डार्क मोड", hi: "डार्क मोड" },
  "Light mode": { kok: "उजवाडाचो मोड", mr: "लाइट मोड", hi: "लाइट मोड" },
  Language: { kok: "भास", mr: "भाषा", hi: "भाषा" },
  "App language": { kok: "ॲपाची भास", mr: "ॲपची भाषा", hi: "ऐप की भाषा" },
  "WhatsApp message language": { kok: "WhatsApp संदेशाची भास", mr: "WhatsApp संदेशाची भाषा", hi: "WhatsApp संदेश की भाषा" },
  "Members get receipts and reminders in this language.": {
    kok: "वांगड्यांक पावती आनी आठवण ह्या भाशेंत मेळटली.",
    mr: "सदस्यांना पावत्या आणि आठवणी या भाषेत मिळतील.",
    hi: "सदस्यों को रसीद और याद दिलाने के संदेश इस भाषा में मिलेंगे.",
  },
  "Some manager pages stay in English for now.": {
    kok: "कांय व्यवस्थापकाचीं पानां सध्या इंग्लीशींत आसात.",
    mr: "व्यवस्थापकाची काही पाने सध्या इंग्रजीतच आहेत.",
    hi: "मैनेजर के कुछ पेज अभी अंग्रेज़ी में ही हैं.",
  },
  "Use Kopri like an app": { kok: "कोप्री ॲप भशेन वापरात", mr: "कोप्री ॲपसारखे वापरा", hi: "कोप्री को ऐप की तरह चलाएँ" },
  "Add it to your home screen. It works offline too.": {
    kok: "होम स्क्रीनाचेर घालात. इंटरनेट नासतनाय चलता.",
    mr: "होम स्क्रीनवर ठेवा. इंटरनेटशिवायही चालते.",
    hi: "होम स्क्रीन पर लगाएँ. बिना इंटरनेट भी चलता है.",
  },
  Install: { kok: "घालात", mr: "इन्स्टॉल करा", hi: "इंस्टॉल करें" },
  Done: { kok: "जालें", mr: "झाले", hi: "हो गया" },
  Back: { kok: "फाटीं", mr: "मागे", hi: "पीछे" },
  Next: { kok: "फुडें", mr: "पुढे", hi: "आगे" },
  Cancel: { kok: "रद्द", mr: "रद्द करा", hi: "रद्द करें" },
  Save: { kok: "सांबाळात", mr: "जतन करा", hi: "सेव करें" },

  // ------------------------------------------------------------ Collect
  "To collect": { kok: "वसूल करपाचें", mr: "वसूल करायचे", hi: "वसूल करना है" },
  "Tap the green button when someone pays. You can undo it straight away.": {
    kok: "कोणेंय पयशे दिले जाल्यार पाचवो बटण दाबात. चूक जाल्यार लगेच परत घेवंक मेळटा.",
    mr: "कोणी पैसे दिले की हिरवे बटण दाबा. चूक झाली तर लगेच मागे घेता येते.",
    hi: "कोई पैसे दे तो हरा बटन दबाएँ. गलती हो तो तुरंत वापस ले सकते हैं.",
  },
  "Record other money": { kok: "हेर पयशे नोंदयात", mr: "इतर पैसे नोंदवा", hi: "दूसरे पैसे दर्ज करें" },
  "Still to collect": { kok: "अजून वसूल करपाचे", mr: "अजून वसूल करायचे", hi: "अभी वसूल करना है" },
  Late: { kok: "उशीर", mr: "उशीर", hi: "देर" },
  "Collected this month": { kok: "ह्या म्हयन्यांत वसूल", mr: "या महिन्यात वसूल", hi: "इस महीने वसूल" },
  "{n} payments": { kok: "{n} भरणे", mr: "{n} भरणा", hi: "{n} भुगतान" },
  "{n} paid": { kok: "{n} भरले", mr: "{n} भरले", hi: "{n} भरे" },
  "Find a name": { kok: "नांव सोदात", mr: "नाव शोधा", hi: "नाम खोजें" },
  All: { kok: "सगळे", mr: "सर्व", hi: "सभी" },
  Deposits: { kok: "ठेवी", mr: "ठेवी", hi: "जमा" },
  "Loan EMIs": { kok: "कर्जाचे हप्ते", mr: "कर्जाचे हप्ते", hi: "कर्ज़ की किस्तें" },
  "Money received in": { kok: "पयशे मेळ्ळे", mr: "पैसे मिळाले", hi: "पैसे मिले" },
  Cash: { kok: "रोख", mr: "रोख", hi: "नकद" },
  "Bank / UPI": { kok: "बँक / UPI", mr: "बँक / UPI", hi: "बैंक / UPI" },
  "Paid {amt}": { kok: "भरले {amt}", mr: "भरले {amt}", hi: "भरे {amt}" },
  Remind: { kok: "आठवण", mr: "आठवण", hi: "याद दिलाएँ" },
  "incl. {amt} late fee": { kok: "{amt} उशीर शुल्क धरून", mr: "{amt} विलंब शुल्कासह", hi: "{amt} लेट फीस सहित" },
  "Paid this month": { kok: "ह्या म्हयन्यांत भरले", mr: "या महिन्यात भरले", hi: "इस महीने भरे" },
  Receipt: { kok: "पावती", mr: "पावती", hi: "रसीद" },
  "Everyone has paid for this month. 🎉": { kok: "ह्या म्हयन्याचे सगळ्यांनी भरले. 🎉", mr: "या महिन्याचे सर्वांनी भरले. 🎉", hi: "इस महीने सबने भर दिया. 🎉" },
  "Nothing to collect for this filter.": { kok: "हांगा वसूल करपाक कांयच ना.", mr: "इथे वसूल करायला काही नाही.", hi: "यहाँ वसूल करने को कुछ नहीं." },
  "No members yet. Set up your kopri in 3 short steps.": {
    kok: "अजून वांगडी नात. 3 ल्हान पांवड्यांनी तुमची कोप्री सुरू करात.",
    mr: "अजून सदस्य नाहीत. 3 छोट्या पायऱ्यांत तुमची कोप्री सुरू करा.",
    hi: "अभी कोई सदस्य नहीं. 3 छोटे कदमों में अपनी कोप्री शुरू करें.",
  },
  "Start setup": { kok: "सुरवात करात", mr: "सुरुवात करा", hi: "शुरू करें" },
  "Late · {n} days": { kok: "उशीर · {n} दीस", mr: "उशीर · {n} दिवस", hi: "देर · {n} दिन" },
  "Late · 1 day": { kok: "उशीर · 1 दीस", mr: "उशीर · 1 दिवस", hi: "देर · 1 दिन" },
  "Due now": { kok: "आतां भरपाचे", mr: "आता भरायचे", hi: "अभी देय" },
  "Due {date}": { kok: "{date} भरपाचे", mr: "{date} ला भरायचे", hi: "{date} को देय" },
  "{month} deposit": { kok: "{month} ठेव", mr: "{month} ठेव", hi: "{month} जमा" },
  "Late fee, {month} deposit": { kok: "उशीर शुल्क, {month} ठेव", mr: "विलंब शुल्क, {month} ठेव", hi: "लेट फीस, {month} जमा" },
  "EMI {i} of {n}": { kok: "हप्तो {i} / {n}", mr: "हप्ता {i} / {n}", hi: "किस्त {i} / {n}" },
  "{amt} from {name} recorded": { kok: "{name} कडल्यान {amt} नोंद केले", mr: "{name} कडून {amt} नोंदवले", hi: "{name} से {amt} दर्ज किया" },
  Undo: { kok: "परत घेयात", mr: "मागे घ्या", hi: "वापस लें" },
  "Send receipt": { kok: "पावती धाडात", mr: "पावती पाठवा", hi: "रसीद भेजें" },
  "More choices": { kok: "आनीक पर्याय", mr: "अधिक पर्याय", hi: "और विकल्प" },
  "Paid a different amount or on another date": { kok: "वेगळी रक्कम वा वेगळ्या दिसा भरले", mr: "वेगळी रक्कम किंवा वेगळ्या दिवशी भरले", hi: "अलग रकम या अलग तारीख को भरा" },
  "Part payment, interest only, or an earlier date": { kok: "थोडे भरले, फकत व्याज, वा आदली तारीख", mr: "थोडे भरले, फक्त व्याज, किंवा आधीची तारीख", hi: "थोड़ा भरा, सिर्फ़ ब्याज, या पहले की तारीख" },
  "Send WhatsApp reminder": { kok: "WhatsApp आठवण धाडात", mr: "WhatsApp आठवण पाठवा", hi: "WhatsApp पर याद दिलाएँ" },
  "To {phone}": { kok: "{phone} क", mr: "{phone} ला", hi: "{phone} को" },
  "No phone saved, you pick the contact": { kok: "फोन नंबर ना, संपर्क तुमी वेंचात", mr: "फोन नंबर नाही, संपर्क तुम्ही निवडा", hi: "फ़ोन नंबर नहीं, संपर्क आप चुनें" },
  "Statement to print or send": { kok: "छापूंक वा धाडूंक हिशोब", mr: "छापायला किंवा पाठवायला हिशोब", hi: "छापने या भेजने के लिए हिसाब" },
  "Open {name}'s page": { kok: "{name} हांचें पान उगडात", mr: "{name} चे पान उघडा", hi: "{name} का पेज खोलें" },
  "Open the loan": { kok: "कर्ज उगडात", mr: "कर्ज उघडा", hi: "कर्ज़ खोलें" },

  // ------------------------------------------------------------ statuses
  Paid: { kok: "भरले", mr: "भरले", hi: "भरा" },
  "Paid late": { kok: "उशिरा भरले", mr: "उशिरा भरले", hi: "देर से भरा" },
  Due: { kok: "भरपाचे", mr: "भरायचे", hi: "देय" },
  "Not due yet": { kok: "अजून वेळ आसा", mr: "अजून वेळ आहे", hi: "अभी समय है" },
  Active: { kok: "चालू", mr: "चालू", hi: "चालू" },
  Inactive: { kok: "बंद", mr: "बंद", hi: "बंद" },
  Closed: { kok: "पुराय जालें", mr: "पूर्ण", hi: "पूरा" },
  "Not paying": { kok: "भरनात", mr: "भरत नाही", hi: "नहीं भर रहे" },
  "Can't recover": { kok: "परत मेळचें ना", mr: "वसूल होणार नाही", hi: "वसूल नहीं होगा" },
  "On time": { kok: "वेळार", mr: "वेळेवर", hi: "समय पर" },
  "Fully repaid": { kok: "पुराय फारीक", mr: "पूर्ण फेडले", hi: "पूरा चुकाया" },

  // ------------------------------------------------------------ forms
  "Add member": { kok: "वांगडी जोडात", mr: "सदस्य जोडा", hi: "सदस्य जोड़ें" },
  "Add borrower": { kok: "कर्जदार जोडात", mr: "कर्जदार जोडा", hi: "कर्ज़दार जोड़ें" },
  "Full name": { kok: "पुराय नांव", mr: "पूर्ण नाव", hi: "पूरा नाम" },
  Type: { kok: "प्रकार", mr: "प्रकार", hi: "प्रकार" },
  Member: { kok: "वांगडी", mr: "सदस्य", hi: "सदस्य" },
  "Member + borrower": { kok: "वांगडी + कर्जदार", mr: "सदस्य + कर्जदार", hi: "सदस्य + कर्ज़दार" },
  "Borrower only": { kok: "फकत कर्जदार", mr: "फक्त कर्जदार", hi: "सिर्फ़ कर्ज़दार" },
  "Pays a monthly deposit and gets a share of the profit": {
    kok: "म्हयन्याची ठेव भरता आनी फायद्यांतलो वांटो मेळटा",
    mr: "मासिक ठेव भरतो आणि नफ्यात वाटा मिळतो",
    hi: "हर महीने जमा करता है और मुनाफ़े में हिस्सा पाता है",
  },
  "Only takes loans. A member must recommend them.": {
    kok: "फकत कर्ज घेता. वांगड्यान शिफारस करची पडटा.",
    mr: "फक्त कर्ज घेतो. सदस्याने शिफारस करावी लागते.",
    hi: "सिर्फ़ कर्ज़ लेता है. किसी सदस्य की सिफ़ारिश ज़रूरी है.",
  },
  "Mobile number": { kok: "मोबायल नंबर", mr: "मोबाईल नंबर", hi: "मोबाइल नंबर" },
  "Used for WhatsApp reminders and receipts": { kok: "WhatsApp आठवण आनी पावतीखातीर", mr: "WhatsApp आठवण आणि पावतीसाठी", hi: "WhatsApp रिमाइंडर और रसीद के लिए" },
  "Monthly deposit (₹)": { kok: "म्हयन्याची ठेव (₹)", mr: "मासिक ठेव (₹)", hi: "मासिक जमा (₹)" },
  "More details (optional)": { kok: "आनीक तपशील (जाय जाल्यार)", mr: "अधिक तपशील (हवे असल्यास)", hi: "और जानकारी (चाहें तो)" },
  "New loan": { kok: "नवें कर्ज", mr: "नवीन कर्ज", hi: "नया कर्ज़" },
  Who: { kok: "कोण", mr: "कोण", hi: "कौन" },
  "How much": { kok: "कितले", mr: "किती", hi: "कितना" },
  Check: { kok: "तपासात", mr: "तपासा", hi: "जाँचें" },
  "Who takes the loan?": { kok: "कर्ज कोण घेता?", mr: "कर्ज कोण घेत आहे?", hi: "कर्ज़ कौन ले रहा है?" },
  "Loan amount (₹)": { kok: "कर्जाची रक्कम (₹)", mr: "कर्जाची रक्कम (₹)", hi: "कर्ज़ की रकम (₹)" },
  "Number of months": { kok: "म्हयन्यांची संख्या", mr: "महिने किती", hi: "कितने महीने" },
  "Interest (%)": { kok: "व्याज (%)", mr: "व्याज (%)", hi: "ब्याज (%)" },
  "Interest per": { kok: "व्याज दर", mr: "व्याज दर", hi: "ब्याज प्रति" },
  Month: { kok: "म्हयनो", mr: "महिना", hi: "महीना" },
  Year: { kok: "वर्स", mr: "वर्ष", hi: "साल" },
  "Loan given on": { kok: "कर्ज दिल्ली तारीख", mr: "कर्ज दिल्याची तारीख", hi: "कर्ज़ दिया गया" },
  "Give loan": { kok: "कर्ज दियात", mr: "कर्ज द्या", hi: "कर्ज़ दें" },
  "Record EMI payment": { kok: "हप्तो नोंदयात", mr: "हप्ता नोंदवा", hi: "किस्त दर्ज करें" },
  "Record money in or out": { kok: "पयशे आयले वा गेले तें नोंदयात", mr: "आलेले किंवा गेलेले पैसे नोंदवा", hi: "आए या गए पैसे दर्ज करें" },
  "What did they pay?": { kok: "तांणी कितें भरलें?", mr: "त्यांनी काय भरले?", hi: "उन्होंने क्या भरा?" },
  "Full EMI": { kok: "पुराय हप्तो", mr: "पूर्ण हप्ता", hi: "पूरी किस्त" },
  "Loan part only": { kok: "फकत कर्जाचो भाग", mr: "फक्त कर्जाचा भाग", hi: "सिर्फ़ कर्ज़ का हिस्सा" },
  "Interest only": { kok: "फकत व्याज", mr: "फक्त व्याज", hi: "सिर्फ़ ब्याज" },
  Date: { kok: "तारीख", mr: "तारीख", hi: "तारीख" },
  "Amount (₹)": { kok: "रक्कम (₹)", mr: "रक्कम (₹)", hi: "रकम (₹)" },
  "Cash or bank": { kok: "रोख वा बँक", mr: "रोख किंवा बँक", hi: "नकद या बैंक" },
  "Note (optional)": { kok: "टीप (जाय जाल्यार)", mr: "टीप (हवे असल्यास)", hi: "नोट (चाहें तो)" },
  "Save payment": { kok: "भरणे सांबाळात", mr: "भरणा जतन करा", hi: "भुगतान सेव करें" },

  // ------------------------------------------------------------ setup guide
  "Set up your kopri": { kok: "तुमची कोप्री सुरू करात", mr: "तुमची कोप्री सुरू करा", hi: "अपनी कोप्री शुरू करें" },
  "Your kopri": { kok: "तुमची कोप्री", mr: "तुमची कोप्री", hi: "आपकी कोप्री" },
  Members: { kok: "वांगडी", mr: "सदस्य", hi: "सदस्य" },
  "Skip for now": { kok: "मागीर करतलों", mr: "नंतर करू", hi: "बाद में करेंगे" },
  "Finish, add members later": { kok: "सोंपयात, वांगडी मागीर जोडतलों", mr: "संपवा, सदस्य नंतर जोडू", hi: "पूरा करें, सदस्य बाद में जोड़ेंगे" },
  "Kopri name": { kok: "कोप्रीचें नांव", mr: "कोप्रीचे नाव", hi: "कोप्री का नाम" },
  "Monthly deposit per member (₹)": { kok: "दर वांगड्याची म्हयन्याची ठेव (₹)", mr: "प्रत्येक सदस्याची मासिक ठेव (₹)", hi: "हर सदस्य की मासिक जमा (₹)" },
  "You can change it for one person later": { kok: "एका मनशाखातीर मागीर बदलूं येता", mr: "एका व्यक्तीसाठी नंतर बदलता येते", hi: "किसी एक के लिए बाद में बदल सकते हैं" },
  "Deposit due on day": { kok: "ठेव भरपाचो दीस", mr: "ठेव भरण्याचा दिवस", hi: "जमा करने का दिन" },
  "of each month": { kok: "दर म्हयन्याचो", mr: "दर महिन्याचा", hi: "हर महीने का" },
  "Late after day": { kok: "ह्या दिसा उपरांत उशीर", mr: "या दिवसानंतर उशीर", hi: "इस दिन के बाद देर" },
  "after this day it shows red": { kok: "उपरांत तांबडें दिसता", mr: "नंतर लाल दिसते", hi: "उसके बाद लाल दिखेगा" },
  "Usual loan interest (%)": { kok: "सादारण कर्जाचें व्याज (%)", mr: "नेहमीचे कर्ज व्याज (%)", hi: "सामान्य कर्ज़ ब्याज (%)" },
  "Days allowed after an EMI's due date": { kok: "हप्त्याच्या तारखे उपरांत सूट दीस", mr: "हप्त्याच्या तारखेनंतर सवलतीचे दिवस", hi: "किस्त की तारीख के बाद छूट के दिन" },
  "Before it counts as late": { kok: "उशीर मानचे आदीं", mr: "उशीर धरण्याआधी", hi: "देर मानने से पहले" },
  "Must a member recommend every loan?": { kok: "दर कर्जाक वांगड्याची शिफारस जाय?", mr: "प्रत्येक कर्जासाठी सदस्याची शिफारस हवी?", hi: "हर कर्ज़ के लिए सदस्य की सिफ़ारिश ज़रूरी?" },
  Yes: { kok: "हय", mr: "हो", hi: "हाँ" },
  No: { kok: "ना", mr: "नाही", hi: "नहीं" },
  Name: { kok: "नांव", mr: "नाव", hi: "नाम" },
  "Late fees, profit split and the financial year can be changed any time in Settings.": {
    kok: "उशीर शुल्क, फायद्याची वांटणी आनी आर्थीक वर्स Settings हांगा केन्नाय बदलूं येता.",
    mr: "विलंब शुल्क, नफ्याची वाटणी आणि आर्थिक वर्ष Settings मध्ये कधीही बदलता येते.",
    hi: "लेट फीस, मुनाफ़े का बँटवारा और वित्त वर्ष Settings में कभी भी बदल सकते हैं.",
  },
  "Add each person with their mobile number (for WhatsApp). Members pay {amt} a month. You can add more details later.": {
    kok: "दर मनशाक ताच्या मोबायल नंबरा सयत जोडात (WhatsApp खातीर). वांगडी म्हयन्याक {amt} भरतले. चड तपशील मागीर जोडूं येता.",
    mr: "प्रत्येकाला मोबाईल नंबरसह जोडा (WhatsApp साठी). सदस्य दरमहा {amt} भरतील. अधिक तपशील नंतर जोडता येतील.",
    hi: "हर व्यक्ति को मोबाइल नंबर के साथ जोड़ें (WhatsApp के लिए). सदस्य हर महीने {amt} भरेंगे. बाकी जानकारी बाद में जोड़ सकते हैं.",
  },
  "+ Add {name}": { kok: "+ {name} जोडात", mr: "+ {name} जोडा", hi: "+ {name} जोड़ें" },
  "this person": { kok: "हो मनीस", mr: "ही व्यक्ती", hi: "यह व्यक्ति" },

  // ------------------------------------------------------------ statement
  "Statement for {name}": { kok: "{name} हांचो हिशोब", mr: "{name} यांचा हिशोब", hi: "{name} का हिसाब" },
  "As on {date}": { kok: "{date} मेरेन", mr: "{date} पर्यंत", hi: "{date} तक" },
  "Nothing due now": { kok: "आतां कांयच भरपाचें ना", mr: "आता काही भरायचे नाही", hi: "अभी कुछ देय नहीं" },
  "Monthly deposit": { kok: "म्हयन्याची ठेव", mr: "मासिक ठेव", hi: "मासिक जमा" },
  "Deposited so far": { kok: "आतां मेरेन ठेवले", mr: "आतापर्यंत जमा", hi: "अब तक जमा" },
  "Balance incl. profit": { kok: "फायद्या सयत शिल्लक", mr: "नफ्यासह शिल्लक", hi: "मुनाफ़े सहित शेष" },
  "Month (FY {fy})": { kok: "म्हयनो (वर्स {fy})", mr: "महिना (वर्ष {fy})", hi: "महीना (वर्ष {fy})" },
  Status: { kok: "स्थिती", mr: "स्थिती", hi: "स्थिति" },
  "Loan of {amt} · {date}": { kok: "{amt} कर्ज · {date}", mr: "{amt} कर्ज · {date}", hi: "{amt} कर्ज़ · {date}" },
  "Paid back": { kok: "परत भरले", mr: "परत फेडले", hi: "वापस चुकाया" },
  "Interest paid": { kok: "व्याज भरले", mr: "व्याज भरले", hi: "ब्याज भरा" },
  "Still to pay": { kok: "अजून भरपाचे", mr: "अजून भरायचे", hi: "अभी चुकाना है" },
  "Late {amt}": { kok: "उशीर {amt}", mr: "उशीर {amt}", hi: "देर {amt}" },
  "{paid} of {n} EMIs paid": { kok: "{n} पैकी {paid} हप्ते भरले", mr: "{n} पैकी {paid} हप्ते भरले", hi: "{n} में से {paid} किस्तें भरीं" },
  "next EMI {amt} due {date}": { kok: "फुडलो हप्तो {amt}, {date}", mr: "पुढचा हप्ता {amt}, {date}", hi: "अगली किस्त {amt}, {date}" },
  "Send on WhatsApp": { kok: "WhatsApp चेर धाडात", mr: "WhatsApp वर पाठवा", hi: "WhatsApp पर भेजें" },
  "Print / PDF": { kok: "छापात / PDF", mr: "छापा / PDF", hi: "प्रिंट / PDF" },
  "No deposits or loans yet.": { kok: "अजून ठेव वा कर्ज ना.", mr: "अजून ठेव किंवा कर्ज नाही.", hi: "अभी कोई जमा या कर्ज़ नहीं." },
  "Prepared by the {kopri} manager on {date}. Please tell the manager if anything looks wrong.": {
    kok: "{kopri} व्यवस्थापकान {date} दिसा तयार केलो. कांय चूक दिसल्यार व्यवस्थापकाक सांगात.",
    mr: "{kopri} व्यवस्थापकाने {date} रोजी तयार केला. काही चूक दिसल्यास व्यवस्थापकाला सांगा.",
    hi: "{kopri} मैनेजर ने {date} को तैयार किया. कुछ गलत लगे तो मैनेजर को बताएँ.",
  },

  // ------------------------------------------------------------ WhatsApp
  "Namaskar {name},": { kok: "नमस्कार {name},", mr: "नमस्कार {name},", hi: "नमस्ते {name}," },
  "Thank you. {kopri}": { kok: "देव बरें करूं. {kopri}", mr: "धन्यवाद. {kopri}", hi: "धन्यवाद. {kopri}" },
  "Received {amt} on {date} towards your {what}.": {
    kok: "तुमच्या {what} खातीर {date} दिसा {amt} मेळ्ळे.",
    mr: "तुमच्या {what} साठी {date} रोजी {amt} मिळाले.",
    hi: "आपकी {what} के लिए {date} को {amt} मिले.",
  },
  "monthly deposit for {month}": { kok: "{month} म्हयन्याची ठेव", mr: "{month} महिन्याची ठेव", hi: "{month} महीने की जमा" },
  "{emi} for your loan": { kok: "कर्जाचो {emi}", mr: "कर्जाचा {emi}", hi: "कर्ज़ की {emi}" },
  "late fee on the {month} deposit": { kok: "{month} ठेवीचें उशीर शुल्क", mr: "{month} ठेवीचे विलंब शुल्क", hi: "{month} जमा की लेट फीस" },
  "Loan amount still to pay: {amt}.": { kok: "अजून भरपाची कर्जाची रक्कम: {amt}.", mr: "अजून भरायची कर्जाची रक्कम: {amt}.", hi: "कर्ज़ की बाकी रकम: {amt}." },
  "Your loan is now fully repaid.": { kok: "तुमचें कर्ज आतां पुराय फारीक जालें.", mr: "तुमचे कर्ज आता पूर्ण फेडले आहे.", hi: "आपका कर्ज़ अब पूरा चुक गया है." },
  "A friendly reminder: your {what} of {amt} {when}.": {
    kok: "उगडास करून दितां: तुमची {what} {amt} {when}.",
    mr: "आठवण करून देतो: तुमची {what} {amt} {when}.",
    hi: "याद दिला रहे हैं: आपकी {what} {amt} {when}.",
  },
  "was due on {date}": { kok: "{date} दिसा भरपाची आशिल्ली", mr: "{date} रोजी भरायची होती", hi: "{date} को देनी थी" },
  "is due on {date}": { kok: "{date} दिसा भरपाची आसा", mr: "{date} रोजी भरायची आहे", hi: "{date} को देनी है" },
  "is due now": { kok: "आतां भरपाची आसा", mr: "आता भरायची आहे", hi: "अभी देनी है" },
  "is due now (please pay by {date})": { kok: "आतां भरपाची आसा ({date} मेरेन भरात)", mr: "आता भरायची आहे ({date} पर्यंत भरा)", hi: "अभी देनी है ({date} तक भर दें)" },
  "Your {kopri} statement as on {date}:": { kok: "{date} मेरेनचो तुमचो {kopri} हिशोब:", mr: "{date} पर्यंतचा तुमचा {kopri} हिशोब:", hi: "{date} तक आपका {kopri} हिसाब:" },
  "• Deposited so far: {amt} ({monthly} a month)": { kok: "• आतां मेरेन ठेवले: {amt} (म्हयन्याक {monthly})", mr: "• आतापर्यंत जमा: {amt} (दरमहा {monthly})", hi: "• अब तक जमा: {amt} ({monthly} महीना)" },
  "• Deposits unpaid: {months} ({amt})": { kok: "• भरूंक नाशिल्ल्यो ठेवी: {months} ({amt})", mr: "• न भरलेल्या ठेवी: {months} ({amt})", hi: "• बाकी जमा: {months} ({amt})" },
  "• All deposits paid up to date": { kok: "• सगळ्यो ठेवी भरल्यात", mr: "• सर्व ठेवी भरल्या आहेत", hi: "• सारी जमा भर दी गई है" },
  "• Loan of {amt}: fully repaid": { kok: "• {amt} कर्ज: पुराय फारीक", mr: "• {amt} कर्ज: पूर्ण फेडले", hi: "• {amt} कर्ज़: पूरा चुका" },
  "• Loan of {amt}: {left} still to pay ({paid} of {n} EMIs paid)": {
    kok: "• {amt} कर्ज: अजून {left} भरपाचे ({n} पैकी {paid} हप्ते भरले)",
    mr: "• {amt} कर्ज: अजून {left} भरायचे ({n} पैकी {paid} हप्ते भरले)",
    hi: "• {amt} कर्ज़: अभी {left} चुकाना है ({n} में से {paid} किस्तें भरीं)",
  },
  "  Late: {amt}": { kok: "  उशीर: {amt}", mr: "  उशीर: {amt}", hi: "  देर: {amt}" },
  "  Next EMI: {amt} due {date}": { kok: "  फुडलो हप्तो: {amt}, {date}", mr: "  पुढचा हप्ता: {amt}, {date}", hi: "  अगली किस्त: {amt}, {date}" },
  "Please pay {amt} that is due now.": { kok: "आतां भरपाचे {amt} भरात.", mr: "आता भरायचे {amt} भरा.", hi: "कृपया अभी देय {amt} भर दें." },
};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s);

export function translate(lang, text, vars) {
  const row = T[text];
  const out = (lang && lang !== "en" && row && row[lang]) || text;
  return fill(out, vars);
}

export function localeOf(lang) {
  const loc = LANGUAGES.find((l) => l.code === lang)?.locale || "en-IN";
  try {
    new Intl.DateTimeFormat(loc);
    return loc;
  } catch {
    return "en-IN";
  }
}

// Month name ("Nov" / "नोव्हें") and dates in the chosen language.
export function monthShortIn(lang, ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(localeOf(lang), { month: "short" });
}
export function monthLongIn(lang, ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(localeOf(lang), { month: "long", year: "numeric" });
}
export function dateIn(lang, iso, withYear = true) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeOf(lang), withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}

// For tests: every translated line must keep the same {placeholders}.
export function checkPlaceholders() {
  const bad = [];
  const keys = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [en, row] of Object.entries(T)) {
    for (const [lang, tr] of Object.entries(row)) if (keys(tr) !== keys(en)) bad.push(`${lang}: ${en}`);
  }
  return bad;
}
export const TRANSLATED_KEYS = Object.keys(T);
