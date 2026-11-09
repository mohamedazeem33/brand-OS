export interface ParsedMetaFormUrl {
  isValid: boolean;
  formId: string | null;
  pageId: string | null;
  error?: string;
}

/**
 * Validates and extracts the Meta Form ID (14-18 digits) and Page ID (if present)
 * from Facebook/Meta Instant Form URLs or direct numeric IDs.
 */
export function parseMetaInstantFormUrl(input: string): ParsedMetaFormUrl {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      formId: null,
      pageId: null,
      error: 'Please enter a Meta Instant Form link or Form ID.',
    };
  }

  const raw = input.trim();

  // Direct numeric form ID (14 to 18 digits)
  if (/^\d{14,18}$/.test(raw)) {
    return { isValid: true, formId: raw, pageId: null };
  }

  try {
    const urlString = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(urlString);

    const hostname = url.hostname.toLowerCase();
    const isMetaDomain =
      hostname === 'facebook.com' ||
      hostname.endsWith('.facebook.com') ||
      hostname === 'meta.com' ||
      hostname.endsWith('.meta.com') ||
      hostname === 'fb.me' ||
      hostname.endsWith('.fb.me') ||
      hostname === 'fb.com' ||
      hostname.endsWith('.fb.com') ||
      hostname === 'instagram.com' ||
      hostname.endsWith('.instagram.com');

    if (!isMetaDomain) {
      return {
        isValid: false,
        formId: null,
        pageId: null,
        error: 'URL must belong to a Meta/Facebook domain (facebook.com, meta.com, instagram.com, fb.me).',
      };
    }

    let formId: string | null = null;
    let pageId: string | null = null;

    // 1. Check Query Parameters
    const params = url.searchParams;
    const formParamKeys = ['id', 'form_id', 'leadgen_id', 'selected_form_id', 'lead_gen_id', 'form'];
    for (const key of formParamKeys) {
      const val = params.get(key);
      if (val && /^\d{14,18}$/.test(val)) {
        formId = val;
        break;
      }
    }

    const pageParamKeys = ['page_id', 'asset_id', 'page', 'business_id'];
    for (const key of pageParamKeys) {
      const val = params.get(key);
      if (val && /^\d{10,18}$/.test(val)) {
        pageId = val;
        break;
      }
    }

    // 2. Check Path Segments if formId not found in query params
    if (!formId) {
      const segments = url.pathname.split('/').filter(Boolean);
      for (const seg of segments) {
        if (/^\d{14,18}$/.test(seg)) {
          formId = seg;
          break;
        }
      }
    }

    // Check Path Segments for page_id if not found
    if (!pageId) {
      const match = url.pathname.match(/\/pages\/(?:[^\/]+\/)?(\d{10,18})/);
      if (match) {
        pageId = match[1];
      }
    }

    if (!formId) {
      return {
        isValid: false,
        formId: null,
        pageId: null,
        error: 'Could not detect a valid 14-18 digit Meta Form ID in this link.',
      };
    }

    return {
      isValid: true,
      formId,
      pageId,
    };
  } catch {
    return {
      isValid: false,
      formId: null,
      pageId: null,
      error: 'Invalid URL format.',
    };
  }
}

