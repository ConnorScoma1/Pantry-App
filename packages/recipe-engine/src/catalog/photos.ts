import type { RecipeImage } from "@kitchen-pantry/shared-types";

/**
 * Photos for the Test Kitchen recipes.
 *
 * Every photo here was checked on its own Unsplash page on 2026-11-01 (licence, photographer and image)
 * and viewed to confirm it shows the right kind of dish. Each is
 * "Free to use under the Unsplash License" (https://unsplash.com/license):
 * free for commercial use, no permission needed. We credit the photographer
 * anyway, as Unsplash asks, and we never sell or redistribute the photos on
 * their own.
 *
 * These show a SIMILAR dish, not our exact recipe, so `representative` is
 * true and the app labels them "Similar dish". Replace with our own
 * photography (license "owned", representative false) when we have it.
 *
 * To add or swap a photo: use only images.unsplash.com / images.pexels.com /
 * upload.wikimedia.org (validation rejects anything else), confirm the
 * licence on the photo's page, and fill in every field.
 */
function unsplash(
  photoId: string,
  pageSlug: string,
  alt: string,
  creditName: string,
  username: string,
): RecipeImage {
  return {
    url: `https://images.unsplash.com/${photoId}`,
    alt,
    license: "unsplash",
    creditName,
    creditUrl: `https://unsplash.com/@${username}`,
    sourceUrl: `https://unsplash.com/photos/${pageSlug}`,
    representative: true,
  };
}

export const TEST_KITCHEN_PHOTOS: Record<string, RecipeImage> = {
  "sheet-pan-lemon-herb-chicken-potatoes": unsplash(
    "photo-1768238907887-023b7ac9f450",
    "roasted-chicken-with-herbs-and-vegetables-in-a-pan-mlQ2_HrjccU",
    "Roasted chicken with herbs and vegetables in a pan",
    "Anto Meneghini",
    "antomeneghini",
  ),
  "black-bean-cheddar-quesadillas": unsplash(
    "photo-1673990349292-ed2dfa7988c9",
    "a-plate-topped-with-a-quesadilla-cut-in-half-_BW-YmENFcM",
    "A quesadilla cut in half on a plate",
    "Benjamin Guardia",
    "benjaminguardia",
  ),
  "weeknight-vegetable-fried-rice": unsplash(
    "photo-1603133872878-684f208fb84b",
    "fried-rice-with-peas-and-carrots-rQX9eVpSFz8",
    "Fried rice with peas and carrots on a white plate",
    "Christopher Alvarenga",
    "krizphoto",
  ),
  "honey-garlic-chicken-broccoli": unsplash(
    "photo-1633030175953-ac5a41b7353c",
    "a-plate-of-broccoli-and-chicken-on-a-table-yF2Gkkwd6Ak",
    "A plate of chicken and broccoli",
    "IamCristian",
    "iamcristian",
  ),
  "turkey-black-bean-chili": unsplash(
    "photo-1790701909034-6c7b45c7b58a",
    "chili-bowl-with-cheese-and-cream-HNVi6m5KCr8",
    "A bowl of chili topped with cheese, sour cream and green onions",
    "Chad Montano",
    "briewilly",
  ),
  "salmon-lemon-dill-yogurt-green-beans": unsplash(
    "photo-1748712831461-9fbf45338e13",
    "grilled-salmon-with-asparagus-and-sauce-C9XlhByIf70",
    "Salmon fillet with green vegetables and sauce",
    "Ксения Лунарис",
    "kseniavisuals",
  ),
  "creamy-tomato-spinach-penne": unsplash(
    "photo-1777333033368-6bbb5d022a08",
    "penne-pasta-with-creamy-tomato-sauce-on-a-white-plate-nfZlM7xe1k4",
    "Penne in a creamy tomato sauce",
    "Brelyn Bashrum",
    "brelynkk",
  ),
  "air-fryer-crispy-chickpea-tacos": unsplash(
    "photo-1578880711837-b028df1bcd06",
    "a-couple-of-tacos-sitting-on-top-of-a-wooden-cutting-board-vw7cL9CyvlE",
    "Tacos on a wooden board",
    "Jakob Owens",
    "jakobowens1",
  ),
  "red-wine-braised-short-ribs": unsplash(
    "photo-1747972312968-daeb233e6bcb",
    "braised-short-rib-garnished-with-microgreens-on-a-plate-hzxOdom4InE",
    "A braised short rib on a plate",
    "hongzhou qian",
    "shyuncle",
  ),
  "peanut-noodles-chicken-crunchy-vegetables": unsplash(
    "photo-1781332152753-1199601d73d2",
    "delicious-chicken-noodles-garnished-with-cucumber-and-carrots-p-uqtfkS0BI",
    "Chicken noodles with cucumber and carrot",
    "Zayed Ahmed Zadu",
    "zayed_ahmed_zadu",
  ),
  "yogurt-spiced-chicken-cardamom-rice": unsplash(
    "photo-1708184528306-f75a0a5118ee",
    "a-plate-of-chicken-and-rice-with-sauces-LPYP9_8dscU",
    "Spiced chicken and rice with sauces",
    "Md Shohan Ridoy",
    "cherrylake",
  ),
  "mushroom-thyme-risotto": unsplash(
    "photo-1572424075298-e17403e6f3bf",
    "mushroom-risotto-dinner-with-parmesan-gg_PV3EvCaM",
    "Mushroom risotto topped with parsley and parmesan",
    "khloe arledge",
    "khloephoto",
  ),
  "chicken-supreme-pommes-puree-tarragon-jus": unsplash(
    "photo-1788462612914-44793f2980f2",
    "chicken-dinner-with-mushroom-sauce-UdO-JP67I-4",
    "Chicken breast with sauce, mashed potatoes and vegetables",
    "gabbiistudios",
    "gabrielonodegba",
  ),
  "seared-scallops-beurre-blanc-pea-puree": unsplash(
    "photo-1732321501974-1ec272b68ecf",
    "a-green-plate-topped-with-scallops-covered-in-sauce-Wf9aOQoBJ7g",
    "Seared scallops in sauce",
    "Meg von Haartman",
    "traveleroohlala",
  ),
  "creamy-garlic-chicken-spinach-parmesan": unsplash(
    "photo-1762631383471-41fca144ca64",
    "sauce-being-poured-over-a-dish-with-vegetables-QTh0Lbiju80",
    "Cream sauce being poured over chicken with vegetables",
    "joe boshra",
    "joestudios",
  ),
};

const UTM = "utm_source=kitchen_pantry&utm_medium=referral";

/** Credit link with the referral tag Unsplash asks apps to add. */
export function creditHref(url: string | null, license: RecipeImage["license"]): string | null {
  if (!url) return null;
  return license === "unsplash" ? `${url}${url.includes("?") ? "&" : "?"}${UTM}` : url;
}

/** Name of the library a licence comes from, for "Photo: X on Y" credits. */
export function imageLibraryName(license: RecipeImage["license"]): string | null {
  switch (license) {
    case "unsplash":
      return "Unsplash";
    case "pexels":
      return "Pexels";
    case "cc0":
    case "cc-by":
    case "cc-by-sa":
      return "Wikimedia Commons";
    default:
      return null;
  }
}

/**
 * Sized image URL. Unsplash and Pexels resize on their CDN, so cards load a
 * small file and the detail page a larger one.
 */
export function recipeImageSrc(image: RecipeImage, width: number): string {
  const host = new URL(image.url).hostname;
  if (host === "images.unsplash.com") return `${image.url}?auto=format&fit=crop&w=${width}&q=70`;
  if (host === "images.pexels.com") return `${image.url}?auto=compress&cs=tinysrgb&w=${width}`;
  return image.url;
}
