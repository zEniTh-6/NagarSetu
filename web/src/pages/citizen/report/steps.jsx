// The four report steps: photo → location → details → review.
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, LocateFixed, MapPin, Pencil, Search, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button.jsx";
import { Input } from "../../../components/Input.jsx";
import { Textarea } from "../../../components/Textarea.jsx";
import { Alert } from "../../../components/Alert.jsx";
import { ChoiceCards } from "../../../components/ChoiceCards.jsx";
import { Spinner } from "../../../components/Spinner.jsx";
import { PhotoPicker } from "../../../components/citizen/PhotoPicker.jsx";
import { CategoryTile, useCategoryName } from "../../../components/citizen/CategoryIcon.jsx";
import { categoriesApi, qk } from "../../../api/citizen.js";
import { searchPlaces } from "../../../lib/nominatim.js";
import { getDevicePosition } from "../../../lib/geolocation.js";
import { inServiceArea } from "../../../lib/serviceArea.js";
import { formatCoords, formatDistance } from "../../../lib/format.js";
import { cx } from "../../../lib/cx.js";

const PinMap = lazy(() => import("../../../components/citizen/PinMap.jsx"));

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 2000;

function MapFallback({ className = "h-80" }) {
  return (
    <div className={cx("flex items-center justify-center rounded-card border border-stone-300 bg-white text-teal-700", className)}>
      <Spinner />
    </div>
  );
}

// ---------- 1. Photo ----------

export function PhotoStep({ draft, update, error, onNext }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-charcoal-900">{t("report.photo.title")}</h2>
        <p className="mt-1 text-body text-graphite-600">{t("report.photo.body")}</p>
      </div>
      <PhotoPicker value={draft.photo} onChange={(photo) => update({ photo })} error={error} />
      <ul className="space-y-1.5 rounded-control border border-stone-300 bg-white p-4 text-caption text-charcoal-900">
        {["tip1", "tip2", "tip3"].map((k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-700" />
            {t(`report.photo.${k}`)}
          </li>
        ))}
      </ul>
      <Button fullWidth disabled={!draft.photo} onClick={onNext}>
        {t("report.next")}
      </Button>
    </div>
  );
}

// ---------- 2. Location ----------

export function LocationStep({ draft, update, error, onNext }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [gpsNote, setGpsNote] = useState(null);
  const [followKey, setFollowKey] = useState(0);

  const pin = draft.location;
  const outside = pin && !inServiceArea(pin.lat, pin.lng);

  // Search runs on Enter / button only (Nominatim policy: no as-you-type, max 1 request per second).
  const onSearch = async (e) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchPlaces(query, { lang: i18n.resolvedLanguage }));
    } catch {
      setSearchError(t("location.searchFailed"));
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    setGpsNote(null);
    try {
      const device = await getDevicePosition();
      update({ device, location: { lat: device.lat, lng: device.lng } });
      setFollowKey((k) => k + 1);
    } catch (err) {
      // Denied / unavailable is neutral: the pin can be placed by hand.
      setGpsNote(t(`location.gps.${err?.code ?? "UNAVAILABLE"}`));
    } finally {
      setLocating(false);
    }
  };

  const choose = (r) => {
    update({ location: { lat: r.lat, lng: r.lng }, addressText: draft.addressText || r.label.slice(0, 300) });
    setResults(null);
    setFollowKey((k) => k + 1);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-charcoal-900">{t("report.location.title")}</h2>
        <p className="mt-1 text-body text-graphite-600">{t("report.location.body")}</p>
      </div>

      <form role="search" onSubmit={onSearch} className="flex gap-2">
        <Input
          className="flex-1"
          label={t("location.searchLabel")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("location.searchPlaceholder")}
          hint={t("location.searchHint")}
        />
        <Button type="submit" variant="outline" className="mt-7 self-start" loading={searching} leftIcon={Search} aria-label={t("location.search")}>
          <span className="hidden sm:inline">{t("location.search")}</span>
        </Button>
      </form>
      {searchError && <Alert tone="error" title={searchError} />}
      {results && (
        <div className="rounded-control border border-stone-300 bg-white">
          {results.length === 0 ? (
            <p className="p-4 text-caption text-graphite-600">{t("location.noResults")}</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`} className="border-b border-stone-300 last:border-0">
                  <button type="button" onClick={() => choose(r)} className="flex min-h-11 w-full items-start gap-2 px-4 py-3 text-start text-caption hover:bg-ivory-50">
                    <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-700" />
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="relative">
        <Suspense fallback={<MapFallback />}>
          <PinMap pin={pin} device={draft.device} followKey={followKey} onMove={(p) => update({ location: p })} />
        </Suspense>
        {!pin && (
          <p className="pointer-events-none absolute inset-x-4 top-3 z-[500] rounded-full bg-forest-900/90 px-4 py-2 text-center text-caption text-ivory-50">
            {t("location.tapHint")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" leftIcon={LocateFixed} loading={locating} onClick={useMyLocation}>
          {t("location.useMine")}
        </Button>
        {draft.device && (
          <span className="tnum rounded-full bg-sage-100 px-3 py-1 text-caption font-semibold text-charcoal-900">
            {t("location.accuracy", { distance: formatDistance(draft.device.accuracyM, i18n.resolvedLanguage) })}
          </span>
        )}
      </div>
      {gpsNote && <Alert tone="info" title={gpsNote} />}

      {pin && (
        <div className="flex items-start gap-3 rounded-control border border-stone-300 bg-white p-4">
          <Crosshair aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-700" />
          <div>
            <p className="text-eyebrow uppercase text-graphite-600">{t("location.selected")}</p>
            <p className="tnum text-label text-charcoal-900">{formatCoords(pin.lat, pin.lng)}</p>
          </div>
        </div>
      )}
      {(outside || error) && (
        <Alert tone="error" title={outside ? t("errors.OUTSIDE_SERVICE_AREA") : error} />
      )}

      <Input
        label={t("location.addressLabel")}
        optional
        maxLength={300}
        value={draft.addressText}
        onChange={(e) => update({ addressText: e.target.value })}
        hint={t("location.addressHint")}
      />

      <Button fullWidth disabled={!pin || outside} onClick={onNext}>
        {t("report.next")}
      </Button>
    </div>
  );
}

// ---------- 3. Details ----------

export function DetailsStep({ draft, update, error, onNext }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const [touched, setTouched] = useState(false);
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list().then((r) => r.categories), staleTime: Infinity });

  const tooShort = draft.description.trim().length < DESCRIPTION_MIN;
  // "Continue" is enabled once a category is chosen; a too-short description is explained on press.
  const next = () => {
    setTouched(true);
    if (draft.categoryKey && !tooShort) onNext();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-charcoal-900">{t("report.details.title")}</h2>
        <p className="mt-1 text-body text-graphite-600">{t("report.details.body")}</p>
      </div>
      {error && <Alert tone="error" title={error} />}

      {categories.isPending ? (
        <Spinner />
      ) : categories.error ? (
        <Alert tone="error" title={t("errors.NETWORK_ERROR")} action={<Button size="sm" variant="outline" onClick={() => categories.refetch()}>{t("common.retry")}</Button>} />
      ) : (
        <ChoiceCards
          label={t("report.details.category")}
          required
          gridClassName="sm:grid-cols-3"
          value={draft.categoryKey}
          onChange={(categoryKey) => update({ categoryKey })}
          options={categories.data.map((c) => ({ value: c.key, label: categoryName(c), icon: <CategoryTile categoryKey={c.key} /> }))}
        />
      )}

      <Textarea
        label={t("report.details.description")}
        required
        rows={6}
        maxLength={DESCRIPTION_MAX}
        value={draft.description}
        onChange={(e) => update({ description: e.target.value })}
        placeholder={t("report.details.placeholder")}
        hint={t("report.details.languageHint")}
        error={touched && tooShort ? t("report.details.tooShort", { min: DESCRIPTION_MIN }) : undefined}
      />

      <Button fullWidth disabled={!draft.categoryKey} onClick={next}>
        {t("report.next")}
      </Button>
      {!draft.categoryKey && <p className="-mt-3 text-center text-caption text-graphite-600">{t("report.details.categoryRequired")}</p>}
    </div>
  );
}

// ---------- 4. Review ----------

function ReviewSection({ title, onEdit, editLabel, children }) {
  return (
    <section className="rounded-card border border-stone-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-eyebrow uppercase text-graphite-600">{title}</h3>
        <Button variant="ghost" size="sm" leftIcon={Pencil} onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}

export function ReviewStep({ draft, goTo, error, onSubmit, busy }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const { data: categories } = useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list().then((r) => r.categories), staleTime: Infinity });
  const category = categories?.find((c) => c.key === draft.categoryKey) ?? { key: draft.categoryKey };

  const edit = t("report.review.edit");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-charcoal-900">{t("report.review.title")}</h2>
        <p className="mt-1 text-body text-graphite-600">{t("report.review.body")}</p>
      </div>
      {error && <Alert tone="error" title={error} />}

      <ReviewSection title={t("report.review.photo")} onEdit={() => goTo(1)} editLabel={edit}>
        <img src={draft.photo.url} alt={t("photo.preview")} className="aspect-[4/3] w-full rounded-control object-cover" />
      </ReviewSection>
      <ReviewSection title={t("report.review.location")} onEdit={() => goTo(2)} editLabel={edit}>
        <Suspense fallback={<MapFallback className="h-44" />}>
          <PinMap pin={draft.location} interactive={false} className="h-44" />
        </Suspense>
        <p className="tnum mt-2 text-caption text-graphite-600">{formatCoords(draft.location.lat, draft.location.lng)}</p>
        {draft.addressText && <p className="text-body text-charcoal-900">{draft.addressText}</p>}
        {!draft.device && <p className="mt-1 text-caption text-graphite-600">{t("report.review.noGps")}</p>}
      </ReviewSection>
      <ReviewSection title={t("report.review.details")} onEdit={() => goTo(3)} editLabel={edit}>
        <div className="flex items-center gap-3">
          <CategoryTile categoryKey={category.key} />
          <p className="text-label text-charcoal-900">{categoryName(category)}</p>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-body text-charcoal-900">{draft.description}</p>
      </ReviewSection>

      <div className="flex gap-3 rounded-control border border-stone-300 bg-ivory-50 p-4">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <p className="text-caption text-charcoal-900">{t("report.review.final")}</p>
      </div>

      <Button fullWidth loading={busy} onClick={onSubmit}>
        {t("report.review.submit")}
      </Button>
    </div>
  );
}
