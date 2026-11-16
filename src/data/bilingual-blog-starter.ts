import type { GuideRecord } from "@/lib/marketplace";

export type BilingualBlogSeedItem = Omit<
  GuideRecord,
  "created_at" | "updated_at" | "published_at"
>;

export const BILINGUAL_BLOG_STARTER_ARTICLES: BilingualBlogSeedItem[] = [
  {
    id: "guide-water-pump-stops",
    slug: "why-your-water-pump-keeps-stopping-kano",
    title: "Why Your Water Pump Keeps Stopping in Kano Homes",
    summary:
      "Common reasons borehole and booster water pumps trip or stop mid-cycle, and what to check before calling a technician.",
    content: "",
    category: "Water Tanks & Pumps",
    status: "published",
    needs_owner_review: false,
    en_title: "Why Your Water Pump Keeps Stopping",
    en_slug: "why-your-water-pump-keeps-stopping-kano",
    en_summary:
      "Learn the real causes behind a pumping machine that starts and stops repeatedly—from low borehole water levels and faulty pressure switches to voltage drops—and when to call a pump technician in Kano.",
    en_content: `## Why a Water Pump Trips or Stops Repeatedly

When your pumping machine starts for a few seconds and shuts off—or stops completely before your overhead tank is full—it is usually protecting the motor from damage or reacting to a pressure fault.

## 1. Dry-Run Protection or Low Water Yield

If the borehole or underground sump runs low, an automatic pressure controller shuts the pump off so the impeller does not burn out while running dry. Running a pump repeatedly without water can damage the mechanical seal and windings.

## 2. Faulty Automatic Pressure Controller or Float Switch

In many Kano homes, mineral scale or worn internal contacts inside the yellow pressure controller or overhead tank float switch cause false cut-offs. The pump either clicks on and off rapidly (short-cycling) or fails to restart.

## 3. Voltage Fluctuations or Weak Capacitor

Low voltage or unstable power supply causes the pump motor to overheat and trip its thermal overload switch. A failing start/run capacitor can also make the motor hum without spinning smoothly.

## 4. Air Locks or Leaking Suction Pipe

A tiny crack or loose union on the suction line lets air into the pump casing. Once air collects inside, the pump loses prime and stops moving water efficiently.

## What to Do Before a Plumber Arrives

Switch off the pump isolator at the wall so the motor does not keep overheating. Check whether the overhead tank float valve is stuck closed, and note whether the pump hums, trips the breaker, or shows a red failure light on the pressure controller.

## Need Water Pump Repair in Kano?

Bin Plumbing Services Ltd coordinates experienced technicians for pumping machine repair, pressure controller replacement, and borehole pump servicing across Kano. Log your request for an on-site inspection and itemised quote before work begins.`,
    en_seo_title: "Why Your Water Pump Keeps Stopping | Pump Repair in Kano",
    en_meta_description:
      "Find out why your pumping machine stops mid-cycle in Kano—low borehole yield, pressure switch faults, air locks, or voltage drops—and book an inspection.",
    en_image_alt:
      "Automatic yellow water pump pressure controller and PVC isolation valve installed by Bin Plumbing",
    en_status: "published",
    ha_title: "Me Ya Sa Injin Ruwa Ke Kashewa Da Kansa?",
    ha_slug: "me-ya-sa-injin-ruwa-ke-kashewa-kano",
    ha_summary:
      "Dalilan da ke sa injin famfon ruwa ya rika tsayawa ko kashewa kafin tanki ya cika, da abin da za a duba kafin a kira mai gyaran injin famfo a Kano.",
    ha_content: `## Dalilan Da Ke Sa Injin Ruwa Ya Rika Tsayawa

Idan injin ruwan gidanku yana tashi na dan lokaci sai ya mutu, ko yana katsewa kafin tankin sama ya cika, akwai dalilai na fasaha da ke haddasa hakan domin kare motar injin daga konewa.

## 1. Karewar Ruwa a Rijiya ko Tanka (Dry Run)

Idan ruwan rijiya ko rijiyar karkashin kasa ya yi kasa, na'urar sarrafa karfin ruwa (automatic pressure controller) kan kashe injin domin kada ya yi aiki ba ruwa a ciki. Barin injin ya yi ta juyawa babu ruwa na lalata silinsa da wayoyin cikinsa.

## 2. Lalacewar Na'urar Pressure Controller ko Float Switch

Tsatsa ko dattin ruwa na iya hana na'urar pressure controller ko makunnin cikin tankin sama (float switch) yin aiki daidai. Wannan kan sa injin ya rika kunnawa yana kashewa akai-akai.

## 3. Karancin Wutar Lantarki ko Lalacewar Capacitor

Idan wutar lantarki ta yi kasa, motar injin kan yi zafi sosai sai thermal overload ya kashe ta. Haka kuma idan capacitor ya lalace, injin zai rika yin kara amma ba ya juya yadda ya kamata.

## 4. Shigar Iska a Bututun Shanye Ruwa (Air Lock)

Idan akwai dan tsagewa ko sako a hadin bututun da ke jawo ruwa zuwa injin, iska za ta shiga ciki, wanda ke hana injin tura ruwa zuwa sama.

## Abin Da Za Ku Yi Kafin Mai Aikin Famfo Ya Iso

Ku kashe makunnin wutar injin domin kada motar ta ci gaba da zafi ko ta kone. Ku duba ko babu wani bawul da aka rufe a hanyar tanki, sannan ku lura ko injin yana yin kara ko yana nuna jan haske a jikin na'urarsa.

## Gyaran Injin Famfo a Kano

Idan kuna bukatar gyaran injin famfo a Kano, ku tura bukata ta shafin Bin Plumbing Services Ltd domin a duba injin a gani kuma a ba ku kiyasin farashi kafin a fara gyara.`,
    ha_seo_title: "Me Ya Sa Injin Ruwa Ke Kashewa? | Gyaran Injin Famfo Kano",
    ha_meta_description:
      "Ku gane dalilan da ke sa injin ruwa ke tsayawa da kansa da yadda za ku kare injinku. Ku nemi mai gyaran injin famfo a Kano.",
    ha_image_alt:
      "Na'urar sarrafa karfin injin ruwa da bawul din PVC da Bin Plumbing suka girka",
    ha_status: "published",
    featured_image: "/images/blog/water-pump-pressure-controller-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field installation",
    target_service_slug: "water-pump-installation-repair",
    main_keyword: "pumping machine repair in Kano",
    supporting_keywords: [
      "water pump repair in Kano",
      "gyaran injin famfo",
      "automatic pressure controller",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-leaking-water-pipe",
    slug: "how-to-fix-a-leaking-water-pipe-kano",
    title: "How to Handle a Leaking Water Pipe Before Repairs",
    summary:
      "Practical steps to stop water waste and prevent wall dampness when a PVC, PPR, or supply pipe starts leaking.",
    content: "",
    category: "Pipe & Leak Repairs",
    status: "published",
    needs_owner_review: false,
    en_title: "How to Fix a Leaking Water Pipe: Safe Steps Before a Plumber Arrives",
    en_slug: "how-to-fix-a-leaking-water-pipe-kano",
    en_summary:
      "Spot hidden and visible water pipe leaks early, shut off the right isolation valve, and understand why proper PPR or PVC joint replacement beats temporary tape.",
    en_content: `## Why Small Pipe Leaks Become Expensive Quickly

A slow drip under a kitchen sink, behind a toilet, or inside a blockwork wall wastes water every hour and gradually weakens plaster, paint, and cabinets.

## 1. Shut Off the Nearest Isolation Valve

Before touching any fitting, locate the stopcock or ball valve feeding that bathroom, kitchen, or overhead tank riser and turn it off. If you cannot find the local valve, close the main outlet valve at the overhead tank.

## 2. Identify Where the Leak Is Coming From

Dry the pipe thoroughly with a cloth and watch carefully. Leaks usually appear at threaded joints (where PTFE thread tape has worn out), solvent-welded PVC elbows, or flexible braided hoses under sinks.

## 3. Avoid Permanent Reliance on Glue or Rubber Patches

Wrapping tape or applying adhesive over a pressurised pipe only slows a drip briefly. Because supply lines experience pressure surges whenever the pump runs, lasting repair requires replacing the cracked fitting, re-fusing PPR pipe, or fitting a fresh compression union.

## 4. Watch for Concealed Wall Leaks

Peeling paint, damp patches near skirting boards, or an unexpectedly fast-emptying overhead tank often point to a concealed pipe leak inside the wall or slab.

## Book Leaking Pipe Repair in Kano

Bin Plumbing Services Ltd provides on-site leak tracing and durable PPR, PVC, and copper pipe repairs in Kano with upfront itemised quotations.`,
    en_seo_title: "How to Fix a Leaking Water Pipe | Water Leakage Repair in Kano",
    en_meta_description:
      "Safe steps when a water pipe leaks at home—shutting off valves, spotting hidden wall dampness, and booking lasting leaking pipe repair in Kano.",
    en_image_alt:
      "Kitchen sink and chrome mixer tap installation inspected by Bin Plumbing",
    en_status: "published",
    ha_title: "Yadda Ake Gyara Bututun Ruwa Mai Yoyo",
    ha_slug: "yadda-ake-gyara-bututun-ruwa-mai-yoyo-kano",
    ha_summary:
      "Matakan farko da za a dauka idan bututun ruwa ya fara yoyo a gida domin hana lalacewar bango da asarar ruwa a Kano.",
    ha_content: `## Me Ya Sa Yoyon Bututun Ruwa Ke Bukatar Gyara Da Wuri

Karamin digon ruwa a karkashin sinkin dafa abinci, bayan bandaki, ko cikin bango na bata ruwa kuma yana lalata fenti da simintin gida idan aka kyale shi.

## 1. Rufe Bawul Din Ruwa Na Wurin

Da farko, ku rufe bawul din da ke kawo ruwa zuwa wannan bangaren ko ku rufe babban bawul din da ke fitowa daga tankin sama. Wannan zai rage karfin ruwa kafin a duba wurin.

## 2. Gano Inda Yoyon Ke Fitowa

Ku goge jikin bututun da tsumma mai tsabta sannan ku lura da inda ruwan ke fita. Yawanci yoyo yana faruwa ne a wurin hadin bututu, ko bututun roba na karkashin sinki, ko inda tef din zare (thread tape) ya tsufa.

## 3. Kada A Dogara Da Tef Ko Gam Na Wucin Gadi

Nada tef ko shafa gam a wajen bututun da ke dauke da karfin ruwa ba ya dadewa, musamman idan injin famfo yana tura ruwa. Gyara mai dorewa yana bukatar canja hadin da ya tsage ko sake hada bututun PPR ko PVC yadda ya kamata.

## 4. Alamomin Yoyon Bututu Cikin Bango

Idan kuka ga danshi ko kumburin fenti a jikin bango, ko tankin ruwa yana saurin karewa ba tare da an yi amfani da shi ba, hakan na nuna akwai yoyo a boye.

## Neman Mai Gyaran Bututun Ruwa a Kano

Ku tuntubi Bin Plumbing Services Ltd domin a zo a duba yoyon bututu a gidanku a Kano tare da ba ku kiyasin gyara kafin a fara aiki.`,
    ha_seo_title: "Yadda Ake Gyara Bututun Ruwa Mai Yoyo | Mai Gyaran Bututu Kano",
    ha_meta_description:
      "Matakan tsaro idan bututun ruwa ya fara yoyo a gida da yadda za a samu mai gyaran bututun ruwa a Kano.",
    ha_image_alt:
      "Girkakken sinkin dafa abinci da famfo mai kyau da Bin Plumbing suka duba",
    ha_status: "published",
    featured_image: "/images/blog/kitchen-sink-tap-installation-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field installation",
    target_service_slug: "leak-detection-repairs",
    main_keyword: "leaking pipe repair in Kano",
    supporting_keywords: [
      "water leakage repair in Kano",
      "mai gyaran bututun ruwa",
      "burst water pipe repair",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-pump-needs-repair-signs",
    slug: "signs-your-water-pump-needs-repair",
    title: "Signs Your Water Pump Needs Repair Before Total Breakdown",
    summary:
      "Early warning signs—unusual noise, overheating, slow tank filling, and water leaks—that mean your water pump needs servicing.",
    content: "",
    category: "Water Tanks & Pumps",
    status: "published",
    needs_owner_review: false,
    en_title: "Signs Your Water Pump Needs Repair",
    en_slug: "signs-your-water-pump-needs-repair",
    en_summary:
      "Spot the early warning signs that your water pump needs repair—grinding bearings, slow tank filling, leaking seals, and frequent breaker trips—before the motor burns out.",
    en_content: `## Catching Pump Faults Early Saves the Motor

Replacing a worn bearing or mechanical seal costs far less than rewinding or replacing a burnt water pump. Pay attention to these warning signs.

## 1. Loud Grinding, Screaming, or Rattling Noises

A healthy surface or booster pump runs with a steady hum. Metallic grinding or high-pitched squealing usually indicates worn motor bearings or debris inside the impeller housing.

## 2. Overhead Tank Takes Much Longer to Fill

If your pump runs twice as long to fill the same tank, the impeller may be worn, a check valve (non-return valve) may be leaking back into the borehole, or the suction strainer is partially blocked.

## 3. Water Dripping From Under the Pump Shaft

Moisture or steady dripping between the motor body and the pump head means the mechanical seal is failing. Left unattended, water can enter the motor windings.

## 4. Frequent Thermal Trips or Hot Casing

A pump casing too hot to touch briefly—or one that trips the distribution breaker—points to voltage stress, seized bearings, or a failing capacitor.

## Schedule a Pump Inspection in Kano

Request a Bin Plumbing technician in Kano to inspect your pump, valves, and electrical controller and give you a clear repair quotation.`,
    en_seo_title: "Signs Your Water Pump Needs Repair | Water Pump Technician Kano",
    en_meta_description:
      "Recognise early signs your water pump needs repair in Kano: grinding noises, slow tank filling, seal leaks, and overheating.",
    en_image_alt: "External water pipe valve and pump line assembly inspected on site",
    en_status: "published",
    ha_title: "Alamomin Da Ke Nuna Injin Ruwa Na Bukatar Gyara",
    ha_slug: "alamomin-injin-ruwa-na-bukatar-gyara",
    ha_summary:
      "Yadda za a gane injin famfon ruwa ya fara lalacewa—yawan kara, jinkirin cika tanki, ko zubar ruwa—kafin motar injin ta kone.",
    ha_content: `## Gane Matsalar Injin Ruwa Da Wuri Yana Kare Asara

Gyara karamar matsala kamar sili ko bering tun da wuri ya fi sauki da rahusa fiye da barin motar injin ta kone gaba daya.

## 1. Sabon Kara Ko Gurnani Mai Karfi

Injin ruwa mai lafiya yana yin kara mai sauki da daidaito. Idan ya fara yin kara mai karfi ko kamar karfe yana gogar karfe, bering din ciki na iya bukatar canzawa.

## 2. Jinkirin Cika Tankin Sama

Idan injin yana dadewa fiye da yadda aka saba kafin ya cika tanki, hakan na iya nuna fiffiken ciki (impeller) ya saba, ko non-return valve yana dawo da ruwa baya.

## 3. Digon Ruwa Daga Tsakiyar Injin

Idan ruwa yana fitowa tsakanin kan injin da motarsa, silin ciki (mechanical seal) ya lalace. Idan ba a gyara da wuri ba, ruwa zai iya shiga cikin wayoyin wuta.

## 4. Yawan Zafi Ko Katse Wuta

Idan jikin injin yana yin zafi sosai ko yana kashe breaker, akwai bukatar a duba wutar lantarki, capacitor, da juyawar motar injin.

## Tuntubi Mai Gyaran Injin Famfo a Kano

Ku nemi ma'aikacin Bin Plumbing Services Ltd a Kano domin duba injin ruwanku tare da ba ku kiyasin gyara a rubuce.`,
    ha_seo_title: "Alamomin Da Ke Nuna Injin Ruwa Na Bukatar Gyara | Kano",
    ha_meta_description:
      "Ku gane alamomin farko da ke nuna injin ruwa na bukatar gyara kafin ya lalace gaba daya a Kano.",
    ha_image_alt: "Bututun ruwa da bawul din waje da ma'aikatan Bin Plumbing suka duba",
    ha_status: "published",
    featured_image: "/images/gallery/real-work-external-pipe-valve.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "water-pump-installation-repair",
    main_keyword: "water pump repair in Kano",
    supporting_keywords: [
      "water pump technician in Kano",
      "borehole pump repair in Kano",
      "gyaran injin famfo",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-choose-water-pump",
    slug: "how-to-choose-a-water-pump-for-your-home",
    title: "How to Choose the Right Water Pump for Your Home",
    summary:
      "What to consider before buying a surface, booster, or submersible water pump—building height, water source depth, and power supply.",
    content: "",
    category: "Water Tanks & Pumps",
    status: "published",
    needs_owner_review: false,
    en_title: "How to Choose a Water Pump for Your Home",
    en_slug: "how-to-choose-a-water-pump-for-your-home",
    en_summary:
      "Avoid buying an undersized or oversized pump. Learn how building height, borehole depth, and pipe diameter determine the right water pump for homes in Kano.",
    en_content: `## Buying the Right Pump Matters

Choosing a pump based only on price or horsepower often leads to weak water delivery on upper floors or unnecessary electricity bills.

## 1. Match the Pump Type to Your Water Source

- **Surface / Centrifugal Pump:** Suitable for pulling water from shallow wells or ground-level storage tanks up to an overhead tank.
- **Submersible Borehole Pump:** Designed to sit deep inside a drilled borehole and push water reliably to the surface and overhead tank.
- **Pressure Booster Pump:** Ideal when water already sits in a tank but taps and showers inside the house have weak pressure.

## 2. Check Total Head Height, Not Just Horsepower

A two-storey or three-storey building needs a pump rated for the vertical lift (head height) plus friction through elbows and horizontal pipes.

## 3. Add Proper Protection Controls

Pair your pump with a quality non-return valve, isolation ball valves for easy servicing, and dry-run/pressure protection so power or water cuts do not ruin the motor.

## Professional Water Pump Installation in Kano

Before purchasing a pump, you can request a Bin Plumbing inspection in Kano so our technician assesses your borehole or tank layout and recommends the right specification.`,
    en_seo_title: "How to Choose a Water Pump for Your Home | Kano Plumbing Guide",
    en_meta_description:
      "Practical guide to choosing a surface, booster, or submersible borehole water pump for homes in Kano based on tank height and water source.",
    en_image_alt: "Water tank and pipe fitting installation by Bin Plumbing",
    en_status: "published",
    ha_title: "Yadda Ake Zabar Injin Ruwa Na Gida",
    ha_slug: "yadda-ake-zabar-injin-ruwa-na-gida",
    ha_summary:
      "Abubuwan da ya kamata a duba kafin sayen injin ruwa—nau'in tushen ruwa, tsayin gida, da na'urorin kare injin.",
    ha_content: `## Zabar Injin Ruwa Da Ya Dace Da Gidanku

Sayen injin ruwa ba tare da auna tsayin tanki da zurfin rijiya ba na iya sa ruwa ya kasa hawa sama ko ya jawo yawan shan wuta.

## 1. Daidaita Nau'in Injin Da Tushen Ruwa

- **Injin Sama (Surface Pump):** Yana da kyau don jawo ruwa daga tankin kasa ko rijiya marar zurfi sosai zuwa tankin sama.
- **Injin Cikin Rijiya (Submersible Pump):** Ana saka shi a cikin rijiya mai zurfi (borehole) domin tura ruwa sama.
- **Booster Pump:** Yana kara karfin ruwa a cikin famfuna da shawa idan tanki yana da ruwa amma gudun ruwan ya yi kadan.

## 2. Duba Tsayin Da Ruwa Zai Hau (Head Height)

Gidan bene yana bukatar injin da ke da karfin tura ruwa sama tare da la'akari da lanƙwasa da tsayin bututu.

## 3. Saka Bawul Da Na'urar Kariya

Yin amfani da non-return valve, bawul din rufe ruwa, da pressure controller yana kare injin kuma yana saukaka gyara a gaba.

## Girka Famfon Ruwa a Kano

Kuna iya neman kwararren mai aikin famfo na Bin Plumbing Services Ltd a Kano domin duba tsarin gidanku kafin ku sayi injin.`,
    ha_seo_title: "Yadda Ake Zabar Injin Ruwa Na Gida | Girka Famfon Ruwa Kano",
    ha_meta_description:
      "Shawarwari masu amfani kan yadda za ku zabi injin ruwa da ya dace da gidanku a Kano.",
    ha_image_alt: "Tankin ruwa da bututun da Bin Plumbing suka hada",
    ha_status: "published",
    featured_image: "/images/gallery/real-work-water-tank-fitting.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "water-pump-installation-repair",
    main_keyword: "water pump installation in Kano",
    supporting_keywords: [
      "submersible pump repair in Kano",
      "girka famfon ruwa",
      "water tank installation in Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-low-water-pressure",
    slug: "common-causes-of-low-water-pressure",
    title: "Common Causes of Low Water Pressure at Home",
    summary:
      "Why taps and showers lose pressure—from blocked aerators and partially closed valves to tank height and pipe scale—and how we diagnose it.",
    content: "",
    category: "Pipe & Leak Repairs",
    status: "published",
    needs_owner_review: false,
    en_title: "Common Causes of Low Water Pressure",
    en_slug: "common-causes-of-low-water-pressure",
    en_summary:
      "Discover why water flows weakly from your shower or kitchen tap in Kano—clogged aerators, stuck gate valves, air pockets, or undersized supply pipes—and how to fix it.",
    en_content: `## Why Water Flow Drops Suddenly or Gradually

Low water pressure can affect one tap or the entire house. Knowing the difference helps pinpoint the cause quickly.

## 1. Blocked Tap Aerators or Showerheads

Sand, silt, and mineral deposits from tank water often collect inside the small mesh filter at the tip of mixer taps and showerheads. Cleaning the mesh often restores flow to a single fixture immediately.

## 2. Partially Closed or Faulty Gate Valves

A gate valve or ball valve that was only half-opened after previous repairs—or whose internal stem has broken—restricts flow to an entire bathroom or floor.

## 3. Low Overhead Tank Elevation or Undersized Risers

If your overhead tank sits too close to the ceiling slab of the top floor, gravity pressure will naturally be weak on upper taps unless a booster pump or higher tank stand is installed.

## 4. Concealed Leaks or Air Locks

Air trapped inside horizontal lines after a tank runs dry, or a hidden pipe leak, drops pressure across the system.

## Low Water Pressure Repair in Kano

Bin Plumbing Services Ltd diagnoses pressure issues on site in Kano and provides a transparent quotation before replacing valves, clearing lines, or installing a booster pump.`,
    en_seo_title: "Common Causes of Low Water Pressure | Plumbing Repair Kano",
    en_meta_description:
      "Find out what causes weak tap and shower pressure in Kano homes and when to call Bin Plumbing for low water pressure repair.",
    en_image_alt: "Multi-storey green PPR water riser and PVC drainage pipework installation",
    en_status: "published",
    ha_title: "Dalilan Raguwar Karfin Ruwan Gida",
    ha_slug: "dalilan-raguwar-karfin-ruwan-gida",
    ha_summary:
      "Abubuwan da ke sa karfin ruwa a famfo ko shawa ya ragu—toshewar ragar famfo, matsalar bawul, ko karancin tsayin tanki.",
    ha_content: `## Me Ya Sa Ruwa Ke Fita Da Sanyi A Famfo Ko Shawa?

Raguwar karfin ruwa na iya shafar famfo guda daya ko dukkan gidan gaba daya.

## 1. Toshewar Ragar Bakunan Famfo da Shawa

Yashi ko dattin da ke fitowa daga tankin ruwa sukan taru a cikin karamar ragar bakin famfo ko shawa. Tsabtace ragar kan dawo da karfin ruwa nan take idan matsalar a wuri daya take.

## 2. Bawul Da Bai Bude Sosai Ba Ko Ya Lalace

Wani lokaci ana barin bawul a rufe rabi bayan gyara, ko kuma ciki ya karye, wanda ke rage gudun ruwa zuwa dukkan bandaki.

## 3. Rashin Tsayin Tankin Sama

Idan tankin sama bai dara rufin daki sosai ba, dakin sama zai rika samun ruwa marar karfi sai an kara tsayin tanki ko an saka booster pump.

## 4. Iska Cikin Bututu Ko Yoyo a Boye

Idan tanki ya kafe gaba daya, iska kan shiga cikin bututu ta rage karfin ruwa. Haka ma yoyon bututu a cikin bango yana rage karfin ruwa.

## Gyaran Matsalar Ruwa a Kano

Ku tura bukata zuwa Bin Plumbing Services Ltd domin a duba tsarin bututun gidanku a Kano a dawo da karfin ruwa yadda ya kamata.`,
    ha_seo_title: "Dalilan Raguwar Karfin Ruwan Gida | Gyaran Matsalar Ruwa Kano",
    ha_meta_description:
      "Ku gano dalilan da ke rage karfin ruwa a gida da yadda kwararrun ma'aikatan famfo a Kano ke magance matsalar.",
    ha_image_alt: "Bututun PPR da na magudanar ruwa da aka girka a ginin bene",
    ha_status: "published",
    featured_image: "/images/blog/ppr-riser-pipe-installation-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "pipe-installation-repairs",
    main_keyword: "low water pressure repair in Kano",
    supporting_keywords: [
      "gyaran matsalar ruwa",
      "water pipe installation in Kano",
      "pipe fitting services in Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-emergency-plumbing",
    slug: "emergency-plumbing-problems-and-what-to-do",
    title: "Emergency Plumbing Problems and What to Do Immediately",
    summary:
      "A clear checklist for burst pipes, overflowing toilets, and pump electrical hazards while waiting for an emergency plumber in Kano.",
    content: "",
    category: "Emergency Plumbing",
    status: "published",
    needs_owner_review: false,
    en_title: "Emergency Plumbing Problems and What to Do",
    en_slug: "emergency-plumbing-problems-and-what-to-do",
    en_summary:
      "Know what to shut off first during a burst water pipe, overflowing toilet, or leaking water heater before an emergency plumber arrives in Kano.",
    en_content: `## Stay Calm and Stop the Source First

When water is spraying from a burst pipe or backing up through a floor drain, the first two minutes matter most for protecting floors, doors, and electrical sockets.

## 1. Burst or Broken Supply Pipe

Turn off the main valve at your overhead tank or booster pump immediately. Open a lower-level tap to drain remaining pressure out of the line, and keep electrical appliances away from standing water.

## 2. Overflowing Toilet

Lift the cistern lid and pull the float arm up (or close the angle valve on the wall behind the toilet) to stop more water entering the tank. Do not keep flushing an already blocked toilet.

## 3. Water Heater or Pump Electrical Hazard

If water is leaking near a water heater switch or pump control box, turn off power at the main distribution board before stepping into wet areas.

## Request an Emergency Plumber in Kano

Submit an urgent request on Bin Plumbing Services Ltd with your area and live map pin. Our coordinator assigns an available technician and shares a tracking reference right away.`,
    en_seo_title: "Emergency Plumbing Problems & What to Do | Emergency Plumber Kano",
    en_meta_description:
      "Fast emergency steps for burst pipes, overflowing toilets, and water leaks—plus how to request an emergency plumber in Kano.",
    en_image_alt: "Bin Plumbing emergency pipe repair on external supply line",
    en_status: "published",
    ha_title: "Matsalolin Famfo Na Gaggawa da Abin Yi",
    ha_slug: "matsalolin-famfo-na-gaggawa-da-abin-yi",
    ha_summary:
      "Matakan gaggawa da za a dauka idan bututu ya fashe, bandaki ya ciko, ko wuta da ruwa suka hadu kafin mai aikin famfo ya iso.",
    ha_content: `## Matakin Farko Lokacin Matsalar Famfo Ta Gaggawa

Idan bututu ya fashe ko ruwa yana malala a daki, matakan farko da za ku dauka za su kare kayan daki da bangon gida daga lalacewa.

## 1. Fashewar Bututun Ruwa

Ku yi gaggawar rufe babban bawul din da ke fitowa daga tankin sama ko injin famfo. Ku bude wani famfon kasa domin ruwan da ya rage a cikin bututu ya fita ya rage karfi.

## 2. Cikar Bandaki Da Kashi Ko Ruwa

Kada ku sake danna flush idan bandaki ya toshe. Ku rufe karamin bawul din da ke bango a bayan bandakin domin hana karin ruwa shiga cikin tankin flush.

## 3. Yoyon Ruwa Kusa Da Wutar Lantarki

Idan ruwa yana digowa kusa da makunnin water heater ko akwatin injin famfo, ku kashe babban makunnin wuta (distribution board) kafin ku taba wurin.

## Neman Mai Aikin Famfo Na Gaggawa a Kano

Ku yi amfani da shafin Request a Plumber na Bin Plumbing Services Ltd ku zabi 'Urgent' tare da sanya adireshinku a Kano domin a tura muku kwararren ma'aikaci.`,
    ha_seo_title: "Matsalolin Famfo Na Gaggawa da Abin Yi | Mai Aikin Famfo Kano",
    ha_meta_description:
      "Abin da ya kamata ku yi nan take idan bututu ya fashe ko bandaki ya ciko a Kano kafin mai aikin famfo ya iso.",
    ha_image_alt: "Gyaran bututun ruwa na gaggawa da ma'aikacin Bin Plumbing ya yi",
    ha_status: "published",
    featured_image: "/images/services/real-work-pipe-repair.png",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "leak-detection-repairs",
    main_keyword: "emergency plumber in Kano",
    supporting_keywords: [
      "burst water pipe repair in Kano",
      "mai aikin famfo Kano",
      "plumber in Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-maintain-water-tank",
    slug: "how-to-maintain-your-water-tank",
    title: "How to Maintain Your Overhead Water Tank",
    summary:
      "Why tank lids, float valves, sediment flushing, and stand inspections keep household water clean and prevent pump overwork.",
    content: "",
    category: "Water Tanks & Pumps",
    status: "published",
    needs_owner_review: false,
    en_title: "How to Maintain Your Water Tank",
    en_slug: "how-to-maintain-your-water-tank",
    en_summary:
      "Keep your household water clean and protect your pipes from silt. Follow this practical overhead water tank maintenance checklist for Kano homes.",
    en_content: `## Why Overhead Tank Care Matters

In Kano, dust, borehole sand, and heat can quickly affect stored water if an overhead tank is left unchecked for years.

## 1. Keep the Tank Lid Sealed Tightly

A loose or cracked tank cover lets dust, leaves, and insects into your water supply. Inspect the lid locking ring periodically, especially after strong Harmattan winds.

## 2. Flush Out Silt and Sediment

Sand and mineral sediment settle at the bottom of tanks over time and eventually travel down into showerheads, mixer cartridges, and toilet inlet valves. Periodic draining and flushing via the washout valve keeps lines clear.

## 3. Inspect the Float Valve and Overflow Pipe

A worn float valve causes the tank to overflow continuously, wasting water and keeping the pump running. Make sure the overflow pipe is clear and routed safely.

## 4. Check Tank Stand and Outlet Unions

Verify that outlet tank connectors and ball valves are not weeping onto steel stands, which accelerates rust.

## Book Water Tank Installation or Servicing in Kano

Bin Plumbing Services Ltd installs, cleans, and re-pipes overhead and ground water tanks in Kano with transparent itemised quotes.`,
    en_seo_title: "How to Maintain Your Water Tank | Water Tank Installation Kano",
    en_meta_description:
      "Practical overhead water tank maintenance guide for Kano homes: sealing lids, flushing sediment, checking float valves, and preventing leaks.",
    en_image_alt: "Overhead water tank piping and valve installation by Bin Plumbing",
    en_status: "published",
    ha_title: "Yadda Ake Kula da Tankin Ruwa",
    ha_slug: "yadda-ake-kula-da-tankin-ruwa",
    ha_summary:
      "Yadda za a tsaftace tankin ruwa, a kare murfin tanki, a duba float valve, da hana yashi toshe famfuna a Kano.",
    ha_content: `## Muhimmancin Kula Da Tankin Ruwan Gida

A yanayin Kano na kura da iskar hunturu, tankin ruwan sama yana bukatar kulawa akai-akai domin ruwan gida ya kasance mai tsafta kuma famfuna su dade suna aiki.

## 1. Tabbatar Murfin Tanki Ya Rufe Gam

Murfin tanki da ya tsage ko bai rufe sosai ba yana barin kura, ganye, da kwari su shiga cikin ruwa. Ku rika duba murfin lokaci zuwa lokaci.

## 2. Fitar Da Yashi Da Dattin Kasan Tanki

Yashi da laka sukan taru a kasan tanki su rika bin bututu suna toshe shawa da makunnin flush na bandaki. Wanke tanki ta wurin bawul din kasa yana kiyaye tsarin bututun gida.

## 3. Duba Float Valve da Bututun Overflow

Idan float valve ya lalace, tanki zai rika zub da ruwa ta sama ba kakkautawa kuma injin famfo zai yi ta aiki ba gaira ba dalili.

## 4. Duba Wuraren Hadin Bututu a Jikin Tanki

Ku tabbatar babu digon ruwa a jikin gindin tanki domin kada karfen da ke dauke da tankin ya yi tsatsa.

## Neman Aikin Tankin Ruwa a Kano

Bin Plumbing Services Ltd na girka tankin ruwa tare da gyaran bawul da bututu a Kano.`,
    ha_seo_title: "Yadda Ake Kula da Tankin Ruwa | Aikin Famfo Kano",
    ha_meta_description:
      "Shawarwari kan yadda ake kula da tankin ruwan sama a gida domin samun ruwa mai tsafta da kare bututu a Kano.",
    ha_image_alt: "Hadin bututu da bawul a jikin tankin ruwa",
    ha_status: "published",
    featured_image: "/images/gallery/real-work-water-tank-fitting.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "water-tank-installation",
    main_keyword: "water tank installation in Kano",
    supporting_keywords: [
      "plumbing maintenance in Kano",
      "aikin famfo Kano",
      "gyaran matsalar ruwa",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-common-toilet-problems",
    slug: "common-toilet-problems-and-their-solutions",
    title: "Common Toilet Problems and Their Solutions",
    summary:
      "How to understand running cisterns, weak flushes, wobbling WC pans, and pan-connector leaks behind the toilet.",
    content: "",
    category: "Bathroom & Toilets",
    status: "published",
    needs_owner_review: false,
    en_title: "Common Toilet Problems and Their Solutions",
    en_slug: "common-toilet-problems-and-their-solutions",
    en_summary:
      "Fix running toilet cisterns, weak flushing, and leaks behind the WC pan. Learn when a simple flush valve replacement solves the problem in Kano.",
    en_content: `## Everyday Toilet Issues That Waste Water

A constantly running toilet or a leaking pan connector behind the WC can waste hundreds of litres of water and cause persistent bathroom odour.

## 1. Water Keeps Running Into the Bowl

This is usually caused by a worn rubber flapper/flush seal at the bottom of the cistern or a float valve set too high so water spills down the overflow tube.

## 2. Weak or Incomplete Flush

Mineral scale or a loose linkage inside dual-flush mechanisms prevents the valve from opening fully. Cleaning or replacing the internal cistern kit restores a clean flush.

## 3. Leak or Odour Behind the Toilet Pan

A cracked or poorly seated flexible pan connector (the ribbed pipe joining the toilet outlet to the wall or floor soil pipe) leaks dirty water whenever the toilet is flushed. Replacing it with a properly sealed connector solves both the leak and smell.

## 4. Loose or Wobbling WC Base

If the floor bolts loosen or silicone fails, movement stresses the pan connector. Re-securing the WC pan prevents future leaks.

## Toilet Repair & Installation in Kano

Book a Bin Plumbing technician in Kano for clean toilet repair, cistern kit replacement, or new WC installation.`,
    en_seo_title: "Common Toilet Problems & Solutions | Toilet Repair in Kano",
    en_meta_description:
      "Learn how to handle running cisterns, weak flushes, and pan-connector leaks behind the toilet—and request toilet repair in Kano.",
    en_image_alt:
      "Rear toilet pan connector and water supply hose inspected during toilet repair",
    en_status: "published",
    ha_title: "Matsalolin Bandaki da Yadda Ake Magance Su",
    ha_slug: "matsalolin-bandaki-da-yadda-ake-magance-su",
    ha_summary:
      "Magance matsalar ruwan flush da ba ya tsayawa, rashin karfin tura kashi, da yoyon bututun bayan WC a bandaki.",
    ha_content: `## Matsalolin Bandaki Da Ke Faruwa Akai-Akai

Yoyon ruwa a bayan bandaki ko tankin flush da ba ya tsayawa yana bata ruwa sosai kuma yana kawo wari a cikin gida.

## 1. Ruwa Na Ci Gaba Da Zuba Cikin Bandaki

Yawanci wannan yana faruwa ne idan robar kasan tankin flush ta tsufa ko kuma float din ciki ya yi sama sosai har ruwa na zuba ta ramin overflow.

## 2. Rashin Karfin Flush

Idan makunnin flush ya saki ko datti ya rike kofar ciki, ruwan da ke fita zai yi kadan. Canja kayan cikin tankin flush (cistern kit) kan gyara wannan nan take.

## 3. Yoyo Ko Wari Daga Bayan Bandaki

Bututun da ke hada bayan WC da babban bututun bango (pan connector) idan ya tsage ko bai zauna daidai ba, yana zubar da datti duk lokacin da aka yi flush.

## 4. Girgizar Bandaki (Wobbling WC)

Idan kusoshi sun saki, motsin bandaki kan cire hadin bututun baya. Gyara zaman WC yana kare yoyo.

## Gyaran Bandaki a Kano

Ku nemi ma'aikacin Bin Plumbing Services Ltd domin gyaran bandaki ko saka sabon WC a Kano.`,
    ha_seo_title: "Matsalolin Bandaki da Yadda Ake Magance Su | Gyaran Bandaki Kano",
    ha_meta_description:
      "Yadda ake magance matsalolin tankin flush, yoyon bayan bandaki, da rashin karfin flush a Kano.",
    ha_image_alt: "Binciken bututun bayan bandaki da famfon ruwa",
    ha_status: "published",
    featured_image: "/images/blog/toilet-pan-connector-repair-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field inspection",
    target_service_slug: "bathroom-toilet-plumbing",
    main_keyword: "toilet repair in Kano",
    supporting_keywords: [
      "toilet installation in Kano",
      "bathroom plumbing installation in Kano",
      "aikin famfo Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-prevent-blocked-drainage",
    slug: "how-to-prevent-blocked-drainage",
    title: "How to Prevent Blocked Drainage in Kitchens and Compounds",
    summary:
      "Simple daily habits and inspection chamber checks that keep kitchen sinks, bathroom floor traps, and compound drains flowing freely.",
    content: "",
    category: "Drainage & Unblocking",
    status: "published",
    needs_owner_review: false,
    en_title: "How to Prevent Blocked Drainage",
    en_slug: "how-to-prevent-blocked-drainage",
    en_summary:
      "Stop kitchen grease, soap hair, and compound sand from blocking your drains. Learn practical prevention and when to call for blocked drainage repair in Kano.",
    en_content: `## Prevention Is Easier Than Digging Up a Drain

Most blocked drains start slowly—a kitchen sink that takes longer to empty or a bathroom floor trap that bubbles when the shower runs.

## 1. Never Pour Cooking Oil or Fat Down the Kitchen Sink

Hot oil looks liquid going down the drain, but it cools inside PVC pipes and hardens into a sticky plug that traps food scraps. Wipe greasy pans before washing and use a sink basket strainer.

## 2. Fit Mesh Strainers on Bathroom Floor Drains

Hair and soap residue bind together inside P-traps and floor gullies. A removable strainer keeps debris out and takes seconds to empty.

## 3. Keep Compound Inspection Chambers Accessible

Never plaster or pave permanently over outdoor drainage inspection chambers. Accessible covers allow quick rodding and flushing if sand enters during the rainy season.

## 4. Avoid Harsh Acid Cleaners on PVC Joints

Repeatedly pouring strong corrosive chemicals can warp thin plastic traps or loosen rubber seals without clearing a solid blockage further down the line.

## Blocked Drainage Repair in Kano

When water backs up or drains gurgle, Bin Plumbing Services Ltd coordinates experienced technicians for drain unblocking and chamber repairs across Kano.`,
    en_seo_title: "How to Prevent Blocked Drainage | Blocked Drainage Repair Kano",
    en_meta_description:
      "Practical ways to prevent blocked kitchen sinks, bathroom traps, and outdoor drainage chambers—plus blocked drainage repair in Kano.",
    en_image_alt: "Underground PVC drainage inspection chamber and pipe network",
    en_status: "published",
    ha_title: "Yadda Ake Hana Toshewar Magudanar Ruwa",
    ha_slug: "yadda-ake-hana-toshewar-magudanar-ruwa",
    ha_summary:
      "Hanyoyi masu sauki na hana kitse, gashi, da yashi toshe sinkin dafa abinci, magudanar bandaki, da ramin duba magudana a gida.",
    ha_content: `## Kare Magudanar Ruwa Kafin Ta Toshe

Yawancin toshewar magudanar ruwa suna farawa a hankali—kamar jinkirin wucewar ruwa a sinki ko kumfa a ramin bandaki.

## 1. Kada A Zuba Mai Ko Kitse A Sinki

Mai mai zafi idan ya shiga bututu yana sanyaya ya daskare ya rike sauran abinci. Ku rika goge kasko kafin wankewa kuma ku saka ragar sinki.

## 2. Saka Raga a Ramin Bandaki

Gashi da kumfar sabulu suna hadewa su toshe cikin P-trap. Karamar raga tana tare su kafin su shiga bututu.

## 3. Barin Murfin Ramin Magudana (Inspection Chamber) A Bude

Kada a rufe wurin duba magudana da siminti dindindin domin a samu damar wanke yashi da datti cikin sauki musamman lokacin damina.

## 4. Guji Zuba Sinadari Mai Karfi Sosai A Bututu

Sinadari mai zafi sosai yana iya lalata bututun roba ba tare da ya cire abin da ya toshe nesa ba.

## Gyaran Toshewar Magudanar Ruwa a Kano

Idan magudanar gidanku ta toshe, ku nemi Bin Plumbing Services Ltd a Kano domin budewa da gyara mai tsafta.`,
    ha_seo_title: "Yadda Ake Hana Toshewar Magudanar Ruwa | Gyaran Magudana Kano",
    ha_meta_description:
      "Yadda za ku kare sinki da bandaki da magudanar gida daga toshewa, da kuma neman mai gyaran magudana a Kano.",
    ha_image_alt: "Ramin duba magudanar ruwa da bututun PVC a karkashin kasa",
    ha_status: "published",
    featured_image: "/images/blog/underground-drainage-chamber-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "drainage-unblocking",
    main_keyword: "blocked drainage repair in Kano",
    supporting_keywords: [
      "drainage installation in Kano",
      "kitchen plumbing installation in Kano",
      "aikin famfo Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-new-house-plumbing-kano",
    slug: "plumbing-work-for-new-houses-in-kano",
    title: "Plumbing Work for New Houses in Kano: First-Fix to Final Testing",
    summary:
      "What homeowners and builders in Kano should check during first-fix PPR piping, drainage slopes, and pressure testing before plastering.",
    content: "",
    category: "New Builds & Pipework",
    status: "published",
    needs_owner_review: false,
    en_title: "Plumbing Work for New Houses in Kano",
    en_slug: "plumbing-work-for-new-houses-in-kano",
    en_summary:
      "Planning plumbing for a new house in Kano? Learn why neat PPR chasing, proper drainage slope, isolation valves, and pressure testing before tiling prevent costly future leaks.",
    en_content: `## Getting New-Build Plumbing Right Before Plastering

In a new house, once blockwork walls are plastered and tiled, fixing a poorly fused pipe joint means breaking finished tiles. Doing the first-fix properly protects your entire building investment.

## 1. Use Genuine PPR / PVC Pipe & Clean Heat Fusion

Hot and cold supply lines chased into walls should use quality PPR pipe with properly timed heat-fusion joints—never crooked or forced bends that stress fittings over time.

## 2. Pressure-Test Every Concealed Line Before Closing Walls

Before masons plaster over pipe chases, pressurise the lines and inspect every elbow, tee, and wall-plate elbow for weeping. A 24-hour pressure check catches hidden pinholes early.

## 3. Set Proper Slope for Waste & Soil Pipes

Toilet soil lines and bathroom waste pipes must maintain a steady fall toward outdoor inspection chambers and the soakaway/septic tank so solids do not settle inside horizontal runs.

## 4. Plan Isolation Valves & Water Heater Points

Include separate isolation valves for each bathroom, kitchen, and overhead tank riser so future maintenance never shuts off the whole house.

## Hire a Plumbing Contractor in Kano

Bin Plumbing Services Ltd coordinates new-house first-fix, second-fix sanitaryware, tank stands, and pump installations across Kano with itemised quotations.`,
    en_seo_title: "Plumbing Work for New Houses in Kano | Plumbing Contractor",
    en_meta_description:
      "Essential plumbing checklist for new houses in Kano: PPR rough-in pipework, pressure testing before plastering, drainage slope, and valve planning.",
    en_image_alt: "Concealed green PPR pipework rough-in inside blockwork walls in Kano",
    en_status: "published",
    ha_title: "Aikin Famfo Na Sabon Gini a Kano",
    ha_slug: "aikin-famfo-na-sabon-gini-a-kano",
    ha_summary:
      "Abubuwan da masu sabon gini a Kano ya kamata su lura da su tun daga saka bututun PPR cikin bango har zuwa gwajin karfin ruwa kafin a yi filasta.",
    ha_content: `## Muhimmancin Yin Aikin Famfo Mai Kyau Kafin Filasta Da Tayis

A sabon gini, da zarar an yi filasta da tayis, gyaran kuskuren bututun ciki yana bukatar fasa bango. Saboda haka yin aikin farko (first-fix) yadda ya kamata yana da matukar muhimmanci.

## 1. Amfani Da Ingantaccen Bututun PPR Da Hadin Zafi Mai Kyau

Bututun da ake binnewa cikin bango suna bukatar ingantaccen PPR da hadin na'urar zafi daidai wa daida ba tare da tankwara su ba.

## 2. Gwada Bututu Da Karfin Ruwa Kafin Rufe Bango

Kafin a rufe bututu da siminti, a cika su da ruwa ko iska mai karfi (pressure test) domin tabbatar babu ko digon yoyo a wuraren hadin gwiwa.

## 3. Daidaita Gangarar Magudanar Ruwa

Bututun kashi da na wanka suna bukatar gangara mai kyau zuwa ramin duba magudana da soakaway domin datti ya rika wucewa cikin sauki.

## 4. Ware Bawul Din Kowane Bandaki Da Kicin

Sanya bawul daban-daban ga kowane bandaki da kicin yana taimakawa idan za a yi gyara a wuri daya ba tare da katse ruwan dukkan gida ba.

## Neman Kwararren Mai Aikin Famfo a Kano

Bin Plumbing Services Ltd na yin aikin famfo na sabon gini a Kano tun daga farko har karshe tare da bayar da takardar kiyasin aiki.`,
    ha_seo_title: "Aikin Famfo Na Sabon Gini a Kano | Sanya Bututun Ruwa",
    ha_meta_description:
      "Shawarwari ga masu sabon gini a Kano kan sanya bututun PPR, gwajin ruwa kafin filasta, da tsarin magudanar ruwa.",
    ha_image_alt: "Aikin binne koren bututun PPR a bangon sabon gini a Kano",
    ha_status: "published",
    featured_image: "/images/blog/ppr-pipework-new-house-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "pipe-installation-repairs",
    main_keyword: "water pipe installation in Kano",
    supporting_keywords: [
      "plumbing contractor in Kano",
      "sanya bututun ruwa",
      "aikin famfo Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-bathroom-plumbing-installation",
    slug: "bathroom-plumbing-installation-guide",
    title: "Bathroom Plumbing Installation: Showers, Mixers, and Sanitaryware",
    summary:
      "Key details for installing rain showers, concealed mixers, washbasins, and toilets so bathrooms stay leak-free and easy to service.",
    content: "",
    category: "Bathroom & Toilets",
    status: "published",
    needs_owner_review: false,
    en_title: "Bathroom Plumbing Installation",
    en_slug: "bathroom-plumbing-installation-guide",
    en_summary:
      "Planning a bathroom renovation or fitting sanitaryware in Kano? Learn how level mixer rough-ins, angle valves, and silicone sealing prevent hidden leaks.",
    en_content: `## Why Precision Matters in Bathroom Second-Fix

A neat bathroom depends on what happens behind the tiles as much as the visible chrome or matte-black fittings.

## 1. Level Hot & Cold Wall Outlets

Shower mixers require hot (left) and cold (right) wall outlets spaced accurately and kept flush with the finished tile face. Uneven outlets strain brass adapters and cause slow drips inside the wall.

## 2. Fit Isolation Angle Valves Under Basins & Toilets

Installing quality quarter-turn angle valves beneath washbasins and beside WCs allows future tap or flexible-hose replacement in minutes without draining the overhead tank.

## 3. Seal Traps, Floor Drains, and Basin Edges

Use proper rubber compression seals on basin bottle traps and quality sanitary silicone around bath/basin edges so splash water never seeps underneath tiles.

## 4. Test Under Full Pressure Before Handover

Run the shower mixer, hand bidet spray, basin tap, and toilet flush together to verify smooth drainage and dry joints.

## Bathroom Plumbing Installation in Kano

Book Bin Plumbing Services Ltd in Kano for complete bathroom sanitaryware, shower mixer, and water heater installation.`,
    en_seo_title: "Bathroom Plumbing Installation in Kano | Bin Plumbing",
    en_meta_description:
      "Guide to clean bathroom plumbing installation in Kano: shower mixers, WCs, washbasins, angle valves, and water heater connections.",
    en_image_alt:
      "Installed stainless rain shower column and mixer fittings in tiled bathroom",
    en_status: "published",
    ha_title: "Girka Kayan Bandaki Da Shawa (Bathroom Plumbing)",
    ha_slug: "girka-kayan-bandaki-da-shawa-kano",
    ha_summary:
      "Abubuwan da ke sa aikin girka shawa, mixer, sinkin wanke hannu, da WC a bandaki ya yi kyau kuma ya dade ba tare da yoyo ba.",
    ha_content: `## Tsafta Da Daidaito A Aikin Bandaki

Kyawun bandaki yana dogara ne da yadda aka daidaita bututun bango tun farko da kuma yadda aka girka kayan ciki bayan tayis.

## 1. Daidaita Wuraren Fitowar Ruwan Zafi Da Sanyi

Wurin da za a daura mixer din shawa yana bukatar daidaito a tsaye da fadi (hagu ruwan zafi, dama ruwan sanyi) domin kar ya karkace ya jawo yoyo.

## 2. Saka Karamin Bawul (Angle Valve) A Kowane Wuri

Saka angle valve a karkashin sinkin wanke hannu da gefen WC yana saukaka canja bututun roba nan gaba ba tare da an kashe ruwan dukkan gida ba.

## 3. Tabbatar Da Kyakkyawan Zama Da Rufewa

Amfani da robobin da ke hana yoyo a P-trap da shafa silicone mai kyau a gefen sinki na hana ruwa shiga karkashin tayis.

## 4. Gwada Komai Bayan An Gama

A kunna shawa, famfo, da flush lokaci guda don tabbatar babu yoyo kuma ruwa yana wucewa yadda ya kamata.

## Aikin Bandaki a Kano

Ku nemi Bin Plumbing Services Ltd a Kano domin girka shawa, WC, sinki, da water heater cikin tsafta.`,
    ha_seo_title: "Girka Kayan Bandaki Da Shawa | Aikin Famfo Kano",
    ha_meta_description:
      "Yadda ake girka shawa, mixer, WC, da sinkin bandaki cikin tsafta ba tare da yoyo ba a Kano.",
    ha_image_alt: "Girkakken shawa da mixer a bandaki mai tayis",
    ha_status: "published",
    featured_image: "/images/blog/bathroom-shower-mixer-installation-kano.jpg",
    image_attribution: "Bin Plumbing Services Ltd field installation",
    target_service_slug: "bathroom-toilet-plumbing",
    main_keyword: "bathroom plumbing installation in Kano",
    supporting_keywords: [
      "water heater installation in Kano",
      "toilet installation in Kano",
      "aikin famfo Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
  {
    id: "guide-when-to-call-plumber",
    slug: "when-to-call-a-professional-plumber",
    title: "When to Call a Professional Plumber Instead of DIY",
    summary:
      "Know which minor checks homeowners can handle safely and which plumbing problems require a reviewed technician and proper tools.",
    content: "",
    category: "Plumbing Tips",
    status: "published",
    needs_owner_review: false,
    en_title: "When to Call a Professional Plumber",
    en_slug: "when-to-call-a-professional-plumber",
    en_summary:
      "Cleaning a tap aerator is fine as DIY, but concealed leaks, water pump faults, and drainage backups need a professional plumber in Kano. Here is how to tell.",
    en_content: `## Knowing Where Safe DIY Ends

Some simple checks—like unscrewing a blocked tap aerator or closing an isolation valve—are safe for any homeowner. Other repairs can quickly turn a small fault into a major leak or electrical hazard if attempted without the right tools.

## Call a Professional Plumber When You Notice:

- **Concealed Wall or Floor Dampness:** Tracing leaks behind tiles or under concrete requires proper pressure testing and clean repair.
- **Pumping Machine & Borehole Faults:** Pumps combine high water pressure with mains electricity and need safe electrical and hydraulic diagnosis.
- **Recurring Blocked Drains:** Repeated backups point to deeper line obstructions or slope issues in outdoor chambers.
- **New Fixtures & Water Heaters:** Installing WCs, showers, or water heaters properly avoids voiding seals or damaging tiled walls.

## How Bin Plumbing Works in Kano

Every request receives a tracking reference, an on-site inspection by a reviewed technician, and an itemised labour-and-materials quotation for your approval before work starts.`,
    en_seo_title: "When to Call a Professional Plumber | Plumber in Kano",
    en_meta_description:
      "Know when to handle a simple plumbing check yourself and when to call a professional plumber in Kano for pumps, leaks, and drains.",
    en_image_alt: "Bin Plumbing field tools and pipe fittings ready for inspection",
    en_status: "published",
    ha_title: "Yaushe Ya Kamata A Kira Kwararren Mai Aikin Famfo?",
    ha_slug: "yaushe-ya-kamata-a-kira-mai-aikin-famfo",
    ha_summary:
      "Banbance tsakanin kananan gyare-gyaren da za ku iya duba da kanku da matsalolin da ke bukatar kwararren mai aikin famfo a Kano.",
    ha_content: `## Sanin Iyakar Gyaran Gida Da Kanka

Akwai abubuwa masu sauki kamar wanke ragar bakin famfo ko rufe bawul idan ruwa na yoyo. Amma wasu matsalolin suna bukatar kwararren mai aikin famfo da kayan aiki na musamman.

## Ku Kira Kwararren Mai Aikin Famfo Idan Kuka Ga:

- **Danshi Cikin Bango Ko Kasa:** Gano yoyon bututu a cikin bango yana bukatar gwaji na musamman don kada a fasa bango ba gaira ba dalili.
- **Matsalar Injin Ruwa Da Wuta:** Injin famfo yana hade da wutar lantarki, don haka yana bukatar kwararre.
- **Yawan Toshewar Magudanar Ruwa:** Idan magudana tana yawan toshewa, akwai matsala a babban bututu ko ramin duba magudana.
- **Girka Sabbin Kayan Bandaki Ko Water Heater:** Gyara mai kyau yana hana yoyo da lalacewar tayis.

## Yadda Bin Plumbing Ke Aiki a Kano

Da zarar kun tura bukata, za a tura muku kwararren ma'aikaci ya duba aikin sannan a ba ku kiyasin farashi kafin a fara gyara.`,
    ha_seo_title: "Yaushe Ya Kamata A Kira Mai Aikin Famfo? | Kano",
    ha_meta_description:
      "Ku gane lokacin da ya kamata a kira kwararren mai aikin famfo a Kano don gyaran yoyo, injin ruwa, da magudana.",
    ha_image_alt: "Kayan aikin famfo da bututu na Bin Plumbing Services Ltd",
    ha_status: "published",
    featured_image: "/images/gallery/real-work-tools-equipment.jpg",
    image_attribution: "Bin Plumbing Services Ltd field work",
    target_service_slug: "pipe-installation-repairs",
    main_keyword: "professional plumber in Kano",
    supporting_keywords: [
      "plumber in Kano",
      "mai aikin famfo Kano",
      "plumbing services in Kano",
    ],
    author_name: "Bin Plumbing Editorial Team",
  },
];
