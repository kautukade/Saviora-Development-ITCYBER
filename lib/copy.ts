/**
 * Every patient-facing string, in one file.
 *
 * Two reasons it lives here rather than beside the components. A translator or a
 * clinician can read the whole of what a patient is ever told in one sitting.
 * And Devanagari must never be uppercased or letter-spaced — keeping the strings
 * together makes it obvious when a style meant for a Latin label is being
 * applied to Hindi.
 */

type Lang = 'en' | 'hi';

const STRINGS = {
  greeting:      { en: 'Hello', hi: 'नमस्ते' },
  sentBy:        { en: 'Sent by', hi: 'भेजा गया' },
  minutes:       { en: 'min', hi: 'मिनट' },
  watch:         { en: 'Watch', hi: 'देखें' },
  read:          { en: 'Read', hi: 'पढ़ें' },
  continue:      { en: 'Continue', hi: 'जारी रखें' },
  again:         { en: 'Watch again', hi: 'दोबारा देखें' },
  readAgain:     { en: 'Read again', hi: 'दोबारा पढ़ें' },
  done:          { en: 'Done', hi: 'पूरा' },
  back:          { en: 'Back to my list', hi: 'मेरी सूची पर वापस' },
  finished:      { en: 'You have seen everything for now.', hi: 'फ़िलहाल आपने सब कुछ देख लिया है।' },
  remember:      { en: 'What to remember', hi: 'याद रखने की बातें' },
  askOnWhatsapp: {
    en: 'Have a question? Send it on WhatsApp and your doctor will see it.',
    hi: 'कोई सवाल है? WhatsApp पर भेजें, आपके डॉक्टर उसे देख लेंगे।',
  },
  /* The message that carries the link. It names the doctor, because that is
     why the patient will open it, and names what was sent, because "some
     information" is not a reason to tap anything. */
  sentOne: {
    en: '{doctor} has sent you “{title}” to read.',
    hi: '{doctor} ने आपको “{title}” पढ़ने के लिए भेजा है।',
  },
  sentMany: {
    en: '{doctor} has sent you {count} things to read, starting with “{title}”.',
    hi: '{doctor} ने आपको पढ़ने के लिए {count} चीज़ें भेजी हैं, शुरुआत “{title}” से।',
  },
  // The name stays as written — it is a proper noun — but the honorific is
  // read aloud in the patient's own script.
  drPrefix: { en: 'Dr', hi: 'डॉ.' },
  sentSomething: {
    en: '{doctor} has sent you something to read.',
    hi: '{doctor} ने आपको पढ़ने के लिए कुछ भेजा है।',
  },
  openHere: { en: 'Open your private link:', hi: 'अपना निजी लिंक खोलें:' },
  greetingLine: { en: 'Namaste {name}.', hi: 'नमस्ते {name}।' },

  sentYou: { en: 'sent you this', hi: 'ने आपको यह भेजा है' },
  thingSingular: { en: 'thing to watch', hi: 'चीज़ देखने के लिए' },
  thingPlural: { en: 'things to watch', hi: 'चीज़ें देखने के लिए' },
  swipeUp: { en: 'swipe up', hi: 'ऊपर स्वाइप करें' },
  tapForSound: { en: 'Tap for sound', hi: 'आवाज़ के लिए टैप करें' },
  play:  { en: 'Play', hi: 'चलाएँ' },
  pause: { en: 'Pause', hi: 'रोकें' },
  sentYouShort: { en: 'sent you this', hi: 'ने आपको यह भेजा है' },
  start: { en: 'Start', hi: 'शुरू करें' },
  next: { en: 'Next', hi: 'आगे' },
  lastOne: { en: 'That was the last one', hi: 'यह आख़िरी था' },

  askButton: { en: 'Ask a question on WhatsApp', hi: 'WhatsApp पर सवाल पूछें' },
  // The patient's opening message. Its only job is to open the 24-hour window,
  // so it has to be something a person would plausibly send.
  askGreeting: {
    en: 'Hello, I have a question about what my doctor sent me.',
    hi: 'नमस्ते, मेरे डॉक्टर ने जो भेजा है उसके बारे में मेरा एक सवाल है।',
  },
  disclaimer: {
    en: 'This is information your doctor chose for you. It is not a substitute for their advice.',
    hi: 'यह जानकारी आपके डॉक्टर ने आपके लिए चुनी है। यह उनकी सलाह का विकल्प नहीं है।',
  },
  linkDeadTitle: { en: 'This link is not active', hi: 'यह लिंक सक्रिय नहीं है' },
  linkDeadBody: {
    en: 'It may have expired or been replaced. Please ask your clinic for a new one.',
    hi: 'यह समाप्त हो गया होगा या बदल दिया गया होगा। कृपया अपने क्लिनिक से नया लिंक माँगें।',
  },
  videoUnavailable: {
    en: 'This video could not load. Check your connection and try again.',
    hi: 'यह वीडियो नहीं चल पाया। अपना कनेक्शन जाँचकर दोबारा कोशिश करें।',
  },

  /* ------------------------------------------------------------- the bot */

  stopped: {
    en: 'You will not receive any more messages. Reply START at any time to resume.',
    hi: 'अब आपको कोई संदेश नहीं भेजा जाएगा। दोबारा शुरू करने के लिए कभी भी START भेजें।',
  },
  resumed: {
    en: 'You will receive messages from the clinic again.',
    hi: 'अब आपको क्लिनिक से दोबारा संदेश मिलेंगे।',
  },
  // Someone we cannot scope to a patient. We never answer them.
  holding: {
    en: 'Thanks for your message. This number belongs to a doctor\'s clinic. Your request has been passed on — they will add you shortly.',
    hi: 'आपके संदेश के लिए धन्यवाद। यह नंबर एक डॉक्टर के क्लिनिक का है। आपका अनुरोध उन तक पहुँचा दिया गया है — वे जल्द ही आपको जोड़ेंगे।',
  },
  // More than one patient is registered with this number. We will not guess
  // which of them is typing.
  shared: {
    en: 'More than one person at the clinic is registered with this number, so I cannot tell who I am speaking to. Someone from the clinic will get in touch.',
    hi: 'इस नंबर पर क्लिनिक में एक से ज़्यादा लोग दर्ज हैं, इसलिए मैं नहीं बता पा रहा कि आप कौन हैं। क्लिनिक से कोई आपसे संपर्क करेगा।',
  },
  escalated: {
    en: 'I don\'t have that in what your doctor gave you, so I have passed your question to them.',
    hi: 'यह बात आपके डॉक्टर द्वारा दी गई सामग्री में नहीं है, इसलिए मैंने आपका सवाल उन तक पहुँचा दिया है।',
  },
  unavailable: {
    en: 'I can\'t answer right now. Your question has been passed to your doctor.',
    hi: 'मैं अभी जवाब नहीं दे पा रहा। आपका सवाल आपके डॉक्टर तक पहुँचा दिया गया है।',
  },
  // Nothing to answer — an acknowledgement, not a question. Short on purpose.
  acknowledged: {
    en: 'Anytime. Send a question whenever you have one.',
    hi: 'कभी भी पूछिए। कोई सवाल हो तो भेज दीजिए।',
  },
  // They want a person, not an answer.
  askedForDoctor: {
    en: 'I have told your doctor you want to speak to them. Someone from the clinic will get back to you.',
    hi: 'मैंने आपके डॉक्टर को बता दिया है कि आप उनसे बात करना चाहते हैं। क्लिनिक से कोई आपसे संपर्क करेगा।',
  },
  notText: {
    en: 'Please send your question as a message I can read.',
    hi: 'कृपया अपना सवाल संदेश के रूप में भेजें।',
  },

  /* --------------------------------------------------------- lab reports */

  readbackIntro: {
    en: 'I read this from your report. Is it right?',
    hi: 'मैंने आपकी रिपोर्ट से यह पढ़ा है। क्या यह सही है?',
  },
  readbackAsk: {
    en: 'Reply YES if this is correct, or NO if anything is wrong.',
    hi: 'अगर यह सही है तो हाँ भेजें, कुछ गलत है तो नहीं भेजें।',
  },
  saved: {
    en: 'Saved. Your doctor will see it.',
    hi: 'सहेज लिया गया। आपके डॉक्टर इसे देख लेंगे।',
  },
  // What a dangerous value gets told: that the doctor has seen it, never what
  // it means. Interpreting a result here would be practising medicine.
  savedFlagged: {
    en: 'Saved, and I have shown it to your doctor now.',
    hi: 'सहेज लिया गया, और मैंने इसे अभी आपके डॉक्टर को दिखा दिया है।',
  },
  resultRejected: {
    en: 'Thank you. I have asked your doctor to look at the report themselves.',
    hi: 'धन्यवाद। मैंने आपके डॉक्टर से कहा है कि वे रिपोर्ट खुद देख लें।',
  },
  retake: {
    en: 'I could not read that clearly. Please send it again — lay the report flat, use good light, and make sure the whole page is in the picture.',
    hi: 'मैं इसे साफ़ नहीं पढ़ पाया। कृपया दोबारा भेजें — रिपोर्ट को सीधा रखें, अच्छी रोशनी में लें, और पूरा पन्ना तस्वीर में आए।',
  },
  gaveUp: {
    en: 'I still could not read it. I have passed the photo to your doctor to look at.',
    hi: 'मैं फिर भी नहीं पढ़ पाया। मैंने तस्वीर आपके डॉक्टर को दिखाने के लिए भेज दी है।',
  },
  nothingFound: {
    en: 'I could see the report but could not find the tests your doctor asked for. I have passed it to them.',
    hi: 'रिपोर्ट दिख रही है, पर आपके डॉक्टर ने जो जाँचें माँगी थीं वे उसमें नहीं मिलीं। मैंने इसे उन तक पहुँचा दिया है।',
  },
  tooBig: {
    en: 'That file was too large. A photo of the report page is enough.',
    hi: 'यह फ़ाइल बहुत बड़ी है। रिपोर्ट के पन्ने की एक तस्वीर काफ़ी है।',
  },
} satisfies Record<string, Record<Lang, string>>;

export type CopyKey = keyof typeof STRINGS;

export function t(key: CopyKey, language: string): string {
  const row = STRINGS[key] as Record<string, string>;
  return row[language] ?? row.en;
}

/**
 * How long it takes, in words a patient acts on.
 *
 * Seconds below a minute, because "27 sec" is the difference between tapping
 * something and leaving it, and rounding a 27-second video up to "1 min" makes
 * it sound like more work than it is.
 */
export function howLong(
  seconds: number | null | undefined,
  estMinutes: number,
  language = 'en',
): string {
  const hi = language === 'hi';
  if (seconds == null) return `${estMinutes} ${hi ? 'मिनट' : 'min'}`;
  if (seconds < 60) return `${seconds} ${hi ? 'सेकंड' : 'sec'}`;
  const mins = Math.round(seconds / 60);
  return `${mins} ${hi ? 'मिनट' : 'min'}`;
}
