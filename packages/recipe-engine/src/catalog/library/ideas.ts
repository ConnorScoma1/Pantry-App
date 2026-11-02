import type { LibraryRecipeInput } from "../../library/import";

/**
 * Dish ideas for the menu builder and "Explore" (spec 08 §7: "menu ideas
 * without complete instructions"). Each is just a well-known dish name, its
 * cuisine, course and rough difficulty — no ingredients or steps, so the app
 * labels them as ideas and never offers to cook them. They're the backlog
 * for full recipes (licensed, commissioned or AI-drafted and reviewed).
 *
 * Format: cuisine | course | skill | title | region (optional) | categories (optional, comma-separated)
 */
const RAW = `
american|main|2|Smash Burgers||comfort,quick
american|main|1|Diner-Style Patty Melt||comfort
american|main|3|Thanksgiving Roast Turkey||holiday
american|side|2|Cornbread Stuffing||holiday
american|side|1|Green Bean Casserole||holiday
american|sauce|1|Cranberry Sauce||holiday
american|dessert|2|Pumpkin Pie||holiday,baking
american|main|3|Lobster Rolls|Maine|seafood_raw_bar
american|dessert|2|New York Cheesecake|New York|baking
southern|main|3|Texas Smoked Brisket|Texas|grilling
cajun_creole|main|3|Chicken and Andouille Gumbo|Louisiana|soup
cajun_creole|main|3|Crawfish Étouffée|Louisiana|
cajun_creole|main|2|Cajun Seafood Boil|Louisiana|seafood_raw_bar,entertaining
tex_mex|main|2|Beef Fajitas|Texas|
hawaiian|main|2|Ahi Poke Bowl|Hawaii|seafood_raw_bar
hawaiian|main|2|Kalua Pork|Hawaii|
mexican|main|4|Mole Poblano|Puebla|holiday
mexican|main|3|Birria Tacos|Jalisco|
mexican|main|3|Tacos al Pastor|Mexico City|
mexican|main|3|Pork Tamales||holiday
mexican|main|3|Tlayudas|Oaxaca|
mexican|main|3|Huachinango a la Veracruzana|Veracruz|
mexican|main|4|Mole Negro|Oaxaca|
mexican|dessert|2|Churros with Chocolate||
mexican|dessert|2|Tres Leches Cake||baking
caribbean|main|3|Curry Goat|Jamaica|
jamaican|main|3|Braised Oxtail with Butter Beans||comfort
jamaican|side|1|Rice and Peas||side
jamaican|side|1|Fried Plantains||side
puerto_rican|main|3|Pernil||holiday
peruvian|starter|2|Classic Ceviche|Lima|seafood_raw_bar
peruvian|main|2|Ají de Gallina||
peruvian|main|3|Anticuchos||grilling
argentine|main|3|Asado||grilling,entertaining
argentine|starter|3|Beef Empanadas||appetizer
argentine|dessert|2|Alfajores||baking
brazilian|main|3|Feijoada||comfort
brazilian|main|2|Moqueca (Fish Stew)|Bahia|soup
brazilian|starter|2|Pão de Queijo||baking
brazilian|main|3|Picanha||grilling
colombian|main|3|Bandeja Paisa|Antioquia|
venezuelan|main|3|Pabellón Criollo||
italian|main|4|Osso Buco alla Milanese|Lombardy|entertaining
italian|main|3|Risotto alla Milanese|Lombardy|
italian|main|3|Handmade Tagliatelle al Ragù|Bologna|
italian|main|3|Potato Gnocchi with Brown Butter & Sage||
italian|main|3|Neapolitan Margherita Pizza|Naples|baking
italian|main|3|Linguine alle Vongole|Campania|
italian|starter|3|Arancini|Sicily|appetizer
italian|dessert|3|Cannoli|Sicily|
french|main|4|Beef Wellington||entertaining,holiday
french|main|3|Duck Confit|Gascony|
french|main|4|Bouillabaisse|Marseille|soup
french|main|2|Steak Frites||date_night
french|starter|4|Cheese Soufflé||
french|sauce|3|Béarnaise Sauce||sauce
french|sauce|3|Hollandaise Sauce||sauce
french|dessert|4|Chocolate Soufflé||date_night
french|dessert|3|Tarte Tatin||baking
spanish|main|3|Paella Valenciana|Valencia|
spanish|dessert|2|Crema Catalana|Catalonia|
portuguese|main|3|Bacalhau à Brás|Lisbon|
portuguese|dessert|3|Pastéis de Nata|Lisbon|baking
greek|main|3|Moussaka||comfort
greek|main|3|Spanakopita||baking
greek|main|3|Grilled Octopus||seafood_raw_bar,grilling
greek|dessert|3|Baklava||baking
british|main|3|Sunday Roast Beef||holiday
british|breakfast|2|Full English Breakfast||breakfast
british|dessert|1|Apple Crumble||comfort
irish|side|1|Colcannon||side
german|main|3|Sauerbraten|Rhineland|
german|main|2|Bratwurst with Sauerkraut||
german|side|2|Spätzle|Swabia|side
german|dessert|3|Black Forest Cake|Baden|baking
austrian|main|3|Wiener Schnitzel (Veal)|Vienna|
austrian|dessert|4|Apfelstrudel|Vienna|baking
swiss|main|2|Cheese Fondue||entertaining
scandinavian|starter|3|Gravlax|Scandinavia|seafood_raw_bar
polish|main|3|Pierogi Ruskie||comfort
polish|main|3|Bigos (Hunter's Stew)||comfort
georgian|main|3|Khachapuri Adjaruli|Adjara|baking
georgian|main|3|Khinkali||
lebanese|main|3|Kibbeh||
lebanese|starter|2|Manakish Za'atar||baking
turkish|main|3|Adana Kebab||grilling
turkish|main|3|İskender Kebab|Bursa|
turkish|main|3|Lahmacun||baking
persian|main|3|Chelo Kabab Koobideh||grilling
persian|side|4|Tahdig||side
persian|main|3|Fesenjan||holiday
moroccan|main|4|Chicken Bastilla|Fez|entertaining
tunisian|main|3|Lablabi||soup
ethiopian|main|3|Key Wat||
ethiopian|side|4|Injera||baking
nigerian|main|3|Egusi Soup||soup
nigerian|side|2|Moi Moi||
senegalese|main|3|Thieboudienne||
kenyan|main|2|Nyama Choma||grilling
south_african|main|2|Boerewors||grilling
chinese|starter|3|Pork and Chive Dumplings||appetizer
chinese|main|5|Peking Duck|Beijing|entertaining
chinese|main|3|Red-Braised Pork Belly (Hong Shao Rou)|Shanghai|
chinese|main|2|Beef and Broccoli||quick
sichuan|main|3|Twice-Cooked Pork|Sichuan|
sichuan|main|4|Chongqing Hot Pot|Chongqing|entertaining
cantonese|starter|4|Har Gow (Shrimp Dumplings)|Guangdong|appetizer
cantonese|starter|3|Siu Mai|Guangdong|appetizer
cantonese|main|3|Char Siu|Guangdong|
cantonese|main|3|Steamed Whole Fish with Ginger & Scallion|Guangdong|
cantonese|main|2|Wonton Noodle Soup|Hong Kong|soup
cantonese|starter|3|Cha Siu Bao|Guangdong|baking
taiwanese|main|3|Beef Noodle Soup||soup
japanese|main|3|Tonkotsu Ramen|Fukuoka|soup
japanese|main|3|Shoyu Ramen|Tokyo|soup
japanese|main|4|Nigiri Sushi||seafood_raw_bar
japanese|main|2|Homemade Maki Rolls||
japanese|main|3|Shrimp and Vegetable Tempura||
japanese|main|2|Yakitori||grilling
japanese|dessert|2|Matcha Mochi||
korean|main|3|Galbi (Grilled Short Ribs)||grilling
korean|main|3|Korean Fried Chicken||comfort
korean|main|2|Tteokbokki||
korean|side|3|Napa Cabbage Kimchi||side
thai|main|3|Massaman Curry with Beef|Southern Thailand|
thai|soup|2|Tom Yum Goong||soup
thai|main|3|Khao Soi|Chiang Mai|soup
vietnamese|soup|3|Phở Bò|Hanoi|soup
vietnamese|main|2|Bánh Mì||
vietnamese|main|3|Bún Chả|Hanoi|grilling
vietnamese|main|2|Cá Kho Tộ (Caramelized Fish)||
filipino|main|3|Lechon Kawali||
filipino|soup|2|Sinigang na Baboy||soup
filipino|main|3|Kare-Kare||holiday
indonesian|main|4|Beef Rendang|West Sumatra|holiday
indonesian|main|2|Gado-Gado||salad
malaysian|main|3|Nasi Lemak||
malaysian|soup|3|Laksa|Penang|soup
singaporean|main|3|Hainanese Chicken Rice||
singaporean|main|3|Chili Crab||seafood_raw_bar
burmese|main|3|Mohinga||soup
burmese|side|2|Tea Leaf Salad (Lahpet Thoke)||salad
cambodian|main|3|Fish Amok||
laotian|side|2|Larb||salad
indian|main|3|Hyderabadi Chicken Biryani|Hyderabad|holiday
indian|main|3|Pork Vindaloo|Goa|
indian|main|3|Masala Dosa|South India|
indian|main|2|Rogan Josh|Kashmir|
indian|main|3|Chettinad Chicken|Tamil Nadu|
indian|main|3|Goan Fish Curry|Goa|
indian|side|3|Garlic Naan||baking
indian|starter|2|Vegetable Samosas||appetizer
indian|dessert|2|Gulab Jamun||holiday
pakistani|main|3|Chicken Karahi||
pakistani|main|3|Nihari||
bangladeshi|main|3|Kacchi Biryani||holiday
sri_lankan|main|3|Sri Lankan Chicken Curry||
sri_lankan|breakfast|3|Egg Hoppers||breakfast
nepali|starter|3|Momos||appetizer
nepali|main|2|Dal Bhat||budget
afghan|main|3|Kabuli Pulao||
uzbek|main|3|Plov||
australian|dessert|3|Pavlova||
australian|main|2|Lamb Chops with Mint Sauce||
pacific_islands|main|2|Kokoda (Coconut-Lime Fish)|Fiji|seafood_raw_bar
jewish|main|3|Braised Brisket||holiday
jewish|soup|2|Matzo Ball Soup||soup,holiday
jewish|side|2|Potato Latkes||holiday
seafood|raw_bar|3|Chilled Seafood Tower||seafood_raw_bar,entertaining
seafood|main|2|Steamed Snow Crab Legs with Drawn Butter||seafood_raw_bar
seafood|starter|3|Scallop Crudo||seafood_raw_bar
seafood|main|2|Moules Marinières||
seafood|main|3|Grilled Whole Branzino||grilling
`;

const COURSE: Record<string, LibraryRecipeInput["course"]> = { main: "main", side: "side", starter: "starter", sauce: "sauce", breakfast: "breakfast", dessert: "dessert", soup: "main", raw_bar: "starter" };

export const dishIdeas: LibraryRecipeInput[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [cuisine, course, skill, title, region, categories] = line.split("|");
    return {
      externalId: `idea:${cuisine}:${title}`,
      title: title!,
      cuisine: cuisine!,
      course: COURSE[course!] ?? "main",
      dessertCategory: course === "dessert" ? "plated" : null,
      skillLevel: Number(skill),
      region: region || null,
      categories: [...(categories ? categories.split(",") : []), ...(course === "soup" ? ["soup"] : [])].filter(Boolean),
      status: "idea" as const,
    };
  });
