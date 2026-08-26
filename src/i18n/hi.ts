import type { Strings } from "./types";

/**
 * Hindi strings. Hindi is a first-class UI language here (Part 3, Typography),
 * not a machine-translated afterthought. These interface-voice strings should
 * still be reviewed by a native Hindi speaker before a public release; the
 * per-sign feedback copy is authored separately by a Deaf reviewer (Part 5.3).
 */
export const hi: Strings = {
  langName: "हिंदी",

  menu: {
    learnTitle: "सीखें",
    learnSubtitle: "हाथ को देखें। कैमरे की ज़रूरत नहीं।",
    testTitle: "परखें और बात करें",
    testSubtitle: "कैमरा चालू करें और साथ में इशारा करें।",
    addSigns: "इशारे जोड़ें",
    learnCount: (n) => (n === 1 ? "१ इशारा तैयार" : `${n} इशारे तैयार`),
  },

  mode: {
    watchHand: "हाथ को देखें",
    tryIt: "अब आप करें",
    converse: "बात करें",
    test: "परखें",
    pickSign: "अभ्यास का इशारा",
    converseHint: "साथ में इशारा करें। हाथ हिलने पर जगमगाते हैं। कुछ भी आँका नहीं जाता।",
    next: "आगे",
    prev: "पीछे",
    back: "घर",
  },

  onboard: {
    s1Title: "अपने बच्चे के साथ इशारे सीखें",
    s1Body:
      "घर पर, किसी भी समय, अपने कैमरे के साथ अभ्यास करें। आपका वीडियो इस फ़ोन से कभी बाहर नहीं जाता।",
    s2Title: "यह क्या है — और क्या नहीं",
    s2Body:
      "यह ऐप देखता है कि आपके हाथ का आकार और चाल सही के करीब है या नहीं। यह नहीं बता सकता कि आप निपुण हैं या नहीं। वह काम बधिर शिक्षक और बधिर समुदाय करते हैं — यहाँ अपने पास उन्हें खोजें।",
    s2FindTeachers: "अपने पास बधिर शिक्षक खोजें",
    s3Title: "तैयारी",
    langLabel: "भाषा",
    handLabel: "कौन इशारा कर रहा है",
    leftHanded: "बाएँ हाथ से",
    rightHanded: "दाएँ हाथ से",
    cameraTitle: "कैमरा",
    cameraBody:
      "कैमरा केवल इसी फ़ोन पर, आपके हाथ देखने के लिए इस्तेमाल होता है। कुछ भी रिकॉर्ड या कहीं नहीं भेजा जाता।",
    cameraCta: "कैमरा चालू करें",
    skip: "छोड़ें",
    next: "आगे",
    begin: "शुरू करें",
  },

  home: {
    rightNow: "अभी",
    signsInGroup: (n) => `इस समूह में ${n} इशारे`,
    homeSigns: "आपके घर के इशारे",
    practiseAgain: "फिर से अभ्यास",
    start: "शुरू करें — ५ मिनट",
    empty: "अभी कोई इशारा नहीं है। शुरू करने के लिए Studio में इशारे जोड़ें।",
  },

  learn: {
    watch: "देखें",
    alongWithMe: "मेरे साथ",
    onYourOwn: "अपने आप",
    slowMotion: "धीमी गति",
    otherAngle: "दूसरा कोण",
    continue: "आगे बढ़ें",
    signNow: "अब इशारा करें",
    seeingYou: "आप दिख रहे हैं",
    cannotSeeYou: "आपके हाथ नहीं दिख रहे",
    signedBy: (name, region) => `${name} · ${region}`,
  },

  feedback: {
    gotItHeadline: "बस यही। आपका बच्चा इसे समझ जाएगा।",
    nextSign: "अगला इशारा",
    watchAgain: "फिर से देखें",
    tryAgain: "फिर कोशिश करें",
    tooDark:
      "हाथ देखने के लिए बहुत अँधेरा है। किसी रोशनी के पास जाएँ, या फ़ोन थोड़ा दूर पकड़ें।",
    unsure: "मैं उसे साफ़ नहीं पढ़ पाया — यह मेरी बात है, आपकी नहीं। एक बार और करें?",
    notRecognized: "मैं वह इशारा नहीं पहचान पाया। एक बार और देखकर फिर कोशिश करें?",
  },

  child: {
    title: "अपने बच्चे के साथ",
    hint: "फ़ोन को अपने बीच सीधा रखें। दोनों इशारा करें। कुछ भी आँका नहीं जाता।",
  },

  studio: {
    title: "Studio",
    english: "अंग्रेज़ी",
    hindi: "हिंदी",
    region: "क्षेत्र",
    handedness: "हाथ",
    record: "टेक रिकॉर्ड करें",
    stop: "रोकें",
    keep: "रखें",
    discard: "हटाएँ",
    takeUnusable: "इस टेक में हाथ ठीक से नहीं दिखे, इसलिए रखा नहीं जा सकता।",
    save: "सहेजें",
    exportPack: "पैक निर्यात करें",
    importPack: "पैक आयात करें",
    saved: "सहेजा गया",
    signerNameLabel: "इशारा करने वाले का नाम (कार्ड पर श्रेय)",
    signLabel: "इशारा",
    consentLabel: "उपरोक्त दायरे के लिए रिकॉर्डिंग की सहमति है।",
    consentScope: "सहमति का दायरा",
    takes: "टेक",
  },

  errors: {
    noCamera: "इस डिवाइस पर कोई कैमरा नहीं मिला। हाथ देखने के लिए Aangan को कैमरा चाहिए।",
    permissionDenied:
      "इस ऐप के लिए कैमरा बंद है। अपने ब्राउज़र की साइट सेटिंग में इसे चालू करें, फिर पेज दोबारा खोलें।",
    wasmFailure:
      "हाथ-पहचान इंजन लोड नहीं हुआ। अपना कनेक्शन जाँचें और पेज दोबारा खोलें — पहली बार के बाद यह बिना इंटरनेट भी चलता है।",
    unsupported:
      "यह ब्राउज़र हाथ-पहचान नहीं चला सकता। Android पर नया Chrome या कोई डेस्कटॉप ब्राउज़र आज़माएँ।",
  },

  privacy: "सिर्फ़ इसी फ़ोन पर। आपका वीडियो कभी डिवाइस से बाहर नहीं जाता।",
};
