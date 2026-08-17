import dayjs from "dayjs";
import "dayjs/locale/de";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";

// Configure dayjs once, app-wide: the relativeTime plugin powers `fromNow()`,
// and the supported app locales are registered so relative labels are
// localized. Consumers import this module instead of the bare `dayjs` package.
dayjs.extend(relativeTime);

/** Maps the app's locale codes to dayjs locale codes. */
const DAYJS_LOCALE: Record<string, string> = {
	"en-US": "en",
	de: "de",
	"zh-CN": "zh-cn",
};

/** Keep dayjs's global locale in sync with the app locale (affects `fromNow()`). */
export function setDayjsLocale(locale: string): void {
	dayjs.locale(DAYJS_LOCALE[locale] ?? "en");
}

export default dayjs;
