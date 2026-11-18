export interface RichServiceContent {
  seoTitle: string;
  metaDescription: string;
  overview: string;
  signsYouNeed: string[];
  commonProblems: string[];
  beforeArrivalSteps: string[];
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
}

export const SERVICE_CONTENT_BY_SLUG: Record<string, RichServiceContent> = {
  "pipe-installation-repairs": {
    seoTitle: "Pipe Installation & Repairs in Kano",
    metaDescription:
      "Need pipe installation or water pipe repairs in Kano? FlowGuard Plumbing coordinates PPR and PVC piping, pressure testing, and clean replacements with upfront itemised quotes.",
    overview:
      "We coordinate full surface and concealed water pipe installations, riser replacements, and damaged joint repairs across residential and commercial properties in Kano using heat-fused PPR and pressure-rated PVC fittings. Every new line is pressure-tested before walls or trenches are sealed.",
    signsYouNeed: [
      "Visible dampness, blistering paint, or wet mortar along block walls",
      "Noticeable drop in tap flow when two bathrooms are used at once",
      "Recurring leaks at old galvanised or poorly glued PVC joints",
      "New building rough-in or renovation requiring clean hot/cold zoning",
    ],
    commonProblems: [
      "Cracked or sun-brittle external PVC risers exposed along compound walls",
      "Weakly fused or misaligned concealed PPR joints leaking behind tiles",
      "Undersized 1/2-inch distribution runs starving upper-floor showers",
      "Missing zone isolation valves forcing whole-house water shutoffs",
    ],
    beforeArrivalSteps: [
      "Close the overhead tank outlet or main gate valve if a pipe is actively spraying.",
      "Clear furniture or stored items away from the affected wall or trench path.",
      "Note whether the affected line feeds hot water, cold water, or the main tank riser.",
    ],
    faqs: [
      {
        question: "Do you work with green PPR pipes for new houses in Kano?",
        answer:
          "Yes. Our technicians handle heat-fused green PPR hot and cold supply lines, manifold zoning, and pressure testing before plastering or tiling.",
      },
      {
        question: "How is pipe installation or repair quoted?",
        answer:
          "A technician inspects the route on site and submits an itemised quotation separating labour, pipe lengths, fittings, and transport before work begins.",
      },
      {
        question: "Can leaking external PVC pipes be replaced without breaking indoor walls?",
        answer:
          "In many Kano homes, damaged surface risers or corroded galvanised runs can be rerouted cleanly with UV-protected PPR or heavy-gauge PVC without disturbing interior tiles.",
      },
    ],
    relatedSlugs: [
      "leak-detection-repairs",
      "water-storage-supply-systems",
      "plumbing-maintenance",
    ],
  },
  "leak-detection-repairs": {
    seoTitle: "Leak Detection and Pipe Repair in Kano",
    metaDescription:
      "Suspect a hidden water leak in Kano? FlowGuard Plumbing coordinates systematic leak tracing, concealed pipe repairs, and valve replacements with itemised quotes.",
    overview:
      "Hidden pipe leaks waste stored tank water, overwork borehole pumps, and damage plaster and foundations. Our technicians isolate supply zones step by step—checking overhead tank outlets, wall manifolds, toilet cisterns, and underground runs—to locate leaks without unnecessary wall breaking.",
    signsYouNeed: [
      "Your overhead water tank drains overnight even when all taps are shut",
      "Your surface or booster pump kicks on repeatedly on its own",
      "Damp patches, salt efflorescence, or mould appearing near skirting or bathroom walls",
      "Wet soil or pooling water along the external compound pipe route",
    ],
    commonProblems: [
      "Slow concealed weeping behind shower mixers and wall-mounted angle valves",
      "Underground PVC/PPR supply splits between borehole and tank stand",
      "Leaking toilet cistern flush valves silently draining tank reserves",
      "Faulty non-return valves allowing tank water to siphon back into the pump",
    ],
    beforeArrivalSteps: [
      "Turn off the water pump and note how fast the overhead tank level drops.",
      "Switch off nearby electrical sockets if water is seeping near a wall switch.",
      "Leave damp patches visible so the technician can trace the moisture path quickly.",
    ],
    faqs: [
      {
        question: "How do you check for hidden leaks without breaking every tile?",
        answer:
          "We isolate individual branches (tank downcomer, bathroom zones, toilet cisterns, and pump riser) to narrow down the leaking circuit before opening only the targeted repair point.",
      },
      {
        question: "Why does my water pump keep turning on every few minutes?",
        answer:
          "Short-cycling usually points to a leaking check valve, a dripping toilet cistern, or an active underground/wall leak bleeding system pressure.",
      },
    ],
    relatedSlugs: [
      "pipe-installation-repairs",
      "pump-installation-repairs",
      "plumbing-maintenance",
    ],
  },
  "drainage-blockage-issues": {
    seoTitle: "Blocked Drain Repair & Drainage in Kano",
    metaDescription:
      "Blocked sink, slow floor drain, or overflowing inspection chamber in Kano? FlowGuard Plumbing coordinates drain clearing and underground drainage repairs with transparent quotes.",
    overview:
      "Slow or backed-up drains quickly cause foul odours and hygiene issues. We handle kitchen and bathroom trap clearing, mechanical rodding of blocked waste lines, inspection chamber servicing, and re-grading of poorly sloped PVC drainage pipes leading to septic tanks and soakaways.",
    signsYouNeed: [
      "Water pooling around bathroom floor traps or backing up in the shower",
      "Gurgling sounds from sinks or WCs when another fixture drains",
      "Persistent sewer odour coming from kitchen sinks or bathroom gullies",
      "Sewage or greywater overflowing at an outdoor inspection chamber",
    ],
    commonProblems: [
      "Solidified cooking oil, soap scum, and food debris blocking kitchen waste lines",
      "Missing or dry P-trap water seals allowing sewer smells indoors",
      "Flat or back-sloped underground PVC runs holding standing wastewater",
      "Silted outdoor gully traps and cracked inspection chamber covers",
    ],
    beforeArrivalSteps: [
      "Stop running washing machines, sinks, or showers on the backed-up line.",
      "Avoid pouring harsh caustic acid into PVC traps, as heat can warp joints.",
      "Show the technician where your outdoor inspection chambers or septic cover sit.",
    ],
    faqs: [
      {
        question: "Can you clear a blocked drain without breaking bathroom tiles?",
        answer:
          "Yes, most blockages are cleared through floor traps, sink P-traps, or outdoor inspection chambers without disturbing interior tiling.",
      },
      {
        question: "Why do bad smells return shortly after cleaning a bathroom?",
        answer:
          "Recurring odours usually mean a missing water-seal trap, a broken vent pipe, or partial sludge buildup in an inspection chamber.",
      },
    ],
    relatedSlugs: [
      "bathroom-toilet-plumbing",
      "kitchen-plumbing",
      "plumbing-maintenance",
    ],
  },
  "bathroom-toilet-plumbing": {
    seoTitle: "Bathroom & Toilet Plumbing Services in Kano",
    metaDescription:
      "Need bathroom plumbing or toilet repair in Kano? FlowGuard Plumbing handles WC installation, cistern repairs, shower mixers, basins, and water heaters with itemised quotes.",
    overview:
      "From leaking WC pan connectors and faulty dual-flush cisterns to complete bathroom sanitaryware installation, we coordinate neat, leak-free bathroom plumbing across Kano. Every mixer, angle valve, water heater, and waste trap is tested under working pressure before handover.",
    signsYouNeed: [
      "Toilet cistern running continuously or failing to refill properly",
      "Water seeping around the base of the WC or behind the pan connector",
      "Dripping shower mixer, weak hot/cold balance, or corroded angle valves",
      "Worn flexible hoses or leaking wash-hand basin bottle traps",
    ],
    commonProblems: [
      "Perished rubber pan-connector seals causing foul leaks behind the WC",
      "Stuck inlet float valves or worn cistern flapper washers",
      "Cross-threaded or corroded wall angle valves feeding bidets and cisterns",
      "Electric water heater safety-valve drips and loose flexible connectors",
    ],
    beforeArrivalSteps: [
      "Shut off the small angle valve on the wall beside the toilet or basin if dripping.",
      "Turn off the electric water heater breaker if a heater pipe or valve is leaking.",
      "Let us know if you already have replacement fittings or need them quoted.",
    ],
    faqs: [
      {
        question: "Do you repair leaking toilet cisterns as well as install new WCs?",
        answer:
          "Yes. We handle both minor cistern mechanism/seal replacements and complete WC, basin, shower column, and water heater installations.",
      },
      {
        question: "Can you fix an uneven or leaking flexible toilet pan connector?",
        answer:
          "Yes. We inspect the wall outlet alignment and fit properly sealed rigid or reinforced pan connectors to stop leaks and sewer odour.",
      },
    ],
    relatedSlugs: [
      "drainage-blockage-issues",
      "leak-detection-repairs",
      "pipe-installation-repairs",
    ],
  },
  "kitchen-plumbing": {
    seoTitle: "Kitchen Plumbing Services in Kano",
    metaDescription:
      "Kitchen sink installation, mixer tap repair, and blocked sink drain clearing in Kano by FlowGuard Plumbing Enterprises. Upfront itemised quotes before work begins.",
    overview:
      "A reliable kitchen needs leak-free sink bowls, smooth mixer taps, and clear grease-resistant waste piping. We install single and double stainless-steel sinks, gooseneck and flexible spray taps, under-sink P-traps, and dishwasher or water-filter connections across Kano.",
    signsYouNeed: [
      "Water dripping inside the kitchen cabinet whenever the sink drains",
      "Loose, stiff, or leaking gooseneck kitchen mixer tap",
      "Slow kitchen sink drainage even after clearing the basket strainer",
      "Upgrading from a single-bowl sink or installing a water purifier feed",
    ],
    commonProblems: [
      "Loose sink basket-strainer nuts and perished under-sink P-trap washers",
      "Worn ceramic cartridges causing kitchen mixer handles to drip",
      "Grease buildup narrowing 40mm/50mm kitchen waste pipes",
      "Split braided supply hoses underneath granite countertops",
    ],
    beforeArrivalSteps: [
      "Empty the cupboard directly beneath the kitchen sink for clear access.",
      "Place a bucket under any active P-trap drip until the technician arrives.",
    ],
    faqs: [
      {
        question: "Can you replace just the kitchen tap without changing the sink?",
        answer:
          "Yes. We replace kitchen mixer taps, braided hoses, and angle valves while keeping your existing sink intact.",
      },
      {
        question: "Why does my kitchen sink leak only when draining a full bowl?",
        answer:
          "That typically points to a loose P-trap compression nut, perished strainer gasket, or partial blockage backing water up the waste joint.",
      },
    ],
    relatedSlugs: [
      "drainage-blockage-issues",
      "leak-detection-repairs",
      "plumbing-maintenance",
    ],
  },
  "water-storage-supply-systems": {
    seoTitle: "Water Tank Installation & Supply in Kano",
    metaDescription:
      "Overhead poly water tank installation, float switches, check valves, and supply manifolds in Kano by FlowGuard Plumbing. Transparent itemised quotes.",
    overview:
      "Reliable water storage is essential for Kano homes and commercial compounds. We plumb overhead and ground poly tanks with proper tank connectors, isolation ball valves, overflow pipes, automatic float switches, and balanced multi-storey distribution manifolds.",
    signsYouNeed: [
      "Overhead tank overflowing continuously or wasting pumped water",
      "Tank outlets weeping around cracked bulkheads or poorly sealed connectors",
      "Low gravity pressure to ground-floor or upstairs bathrooms",
      "Connecting a second poly tank to increase household storage capacity",
    ],
    commonProblems: [
      "Single pipe mistakenly used for both pump fill and house gravity supply",
      "Missing non-return valve letting tank water drain back down to the pump",
      "Faulty mechanical float valves or burned-out electric float switches",
      "Leaking tank bulkhead seals or undersized outlet manifolds",
    ],
    beforeArrivalSteps: [
      "Ensure safe access to the tank stand or rooftop platform.",
      "Switch off the borehole/surface pump if the tank is currently overflowing.",
    ],
    faqs: [
      {
        question: "Can you link two overhead tanks to balance water levels?",
        answer:
          "Yes. We plumb dual-tank equalising manifolds with dedicated isolation valves so you can wash one tank without cutting water to the building.",
      },
      {
        question: "Why should a tank have separate inlet and outlet pipes?",
        answer:
          "Separate inlet risers and gravity downcomers prevent pump back-pressure from forcing dirty sediment through house taps and make isolation easy.",
      },
    ],
    relatedSlugs: [
      "pump-installation-repairs",
      "pipe-installation-repairs",
      "plumbing-maintenance",
    ],
  },
  "pump-installation-repairs": {
    seoTitle: "Water Pump Installation and Repair in Kano",
    metaDescription:
      "Surface, booster, and submersible water pump installation and repair in Kano. Pressure controller setup, check valves, and troubleshooting by FlowGuard Plumbing.",
    overview:
      "We install, troubleshoot, and service surface transfer pumps, automatic booster pumps, and borehole pump connections across Kano. Our technicians inspect suction lines, foot valves, non-return check valves, and automatic pressure controllers so your pump runs reliably without dry-run damage.",
    signsYouNeed: [
      "Pump motor hums but refuses to spin or trips the breaker",
      "Automatic pressure controller shows a red fault light or shuts off early",
      "Pump runs continuously without lifting water into the overhead tank",
      "Frequent rapid on/off cycling even when taps are closed",
    ],
    commonProblems: [
      "Air leaks on the suction pipe or faulty brass foot valve losing prime",
      "Jammed or faulty automatic pressure controller switches",
      "Weak start capacitors or thermal overload trips from voltage drops",
      "Missing non-return valve hammering the pump impeller when shutting off",
    ],
    beforeArrivalSteps: [
      "Switch off the pump breaker or unplug the unit if it is humming or overheating.",
      "Do not bypass the automatic pressure controller, as running dry burns pump seals.",
    ],
    faqs: [
      {
        question: "Why does my water pump keep stopping and showing a red light?",
        answer:
          "That usually indicates the pressure controller's dry-run protection triggered due to low source water, an air leak in the suction line, or a stuck foot valve.",
      },
      {
        question: "Can you install an automatic pressure controller on an existing pump?",
        answer:
          "Yes, we retrofit automatic pressure controllers and non-return valves onto compatible surface and booster pumps after checking pipework.",
      },
    ],
    relatedSlugs: [
      "water-storage-supply-systems",
      "leak-detection-repairs",
      "plumbing-maintenance",
    ],
  },
  "commercial-plumbing": {
    seoTitle: "Commercial Plumbing Services in Kano",
    metaDescription:
      "Structured commercial and multi-storey plumbing for offices, schools, plazas, and facilities in Kano by FlowGuard Plumbing Enterprises. Itemised quotes and tracking.",
    overview:
      "Offices, schools, clinics, plazas, and multi-storey buildings in Kano need durable, serviceable plumbing. We coordinate multi-point PPR risers, commercial washroom banks, large-capacity tank manifolds, booster pump sets, and external drainage lines with clear milestone reporting.",
    signsYouNeed: [
      "Fit-out or renovation of an office, plaza, school, or residential block",
      "Frequent washroom breakdowns, low upper-floor pressure, or shared drain backups",
      "Need for zone isolation valves so repairs do not disrupt the entire building",
    ],
    commonProblems: [
      "Undersized main risers causing pressure starvation on upper floors",
      "Unzoned washrooms requiring whole-building shutoffs during minor repairs",
      "Heavy-use commercial WC flush valves and urinal traps needing durable parts",
    ],
    beforeArrivalSteps: [
      "Have building plans or access to risers, pump rooms, and inspection chambers ready.",
      "Share any facility access hours or safety requirements in your request notes.",
    ],
    faqs: [
      {
        question: "Do you provide itemised quotations for facility managers?",
        answer:
          "Yes. Every job receives a transparent itemised quote separating labour, materials, and transport so facility teams can review and approve before work starts.",
      },
    ],
    relatedSlugs: [
      "pipe-installation-repairs",
      "water-storage-supply-systems",
      "plumbing-maintenance",
    ],
  },
  "plumbing-maintenance": {
    seoTitle: "Preventative Plumbing Maintenance in Kano",
    metaDescription:
      "Scheduled plumbing inspection and preventative maintenance in Kano by FlowGuard Plumbing. Catch leaking valves, pump wear, and drain buildup before emergencies.",
    overview:
      "Routine plumbing servicing prevents sudden pipe bursts, flooded bathrooms, and burned-out water pumps. We inspect isolation valves, toilet cisterns, tank bulkheads, pump controllers, and drainage traps so minor wear is corrected affordably before major damage occurs.",
    signsYouNeed: [
      "Stiff or weeping gate/ball valves that no longer shut off cleanly",
      "Moving into a newly rented or purchased property in Kano",
      "Annual overhead tank flushing and pump/valve health check",
    ],
    commonProblems: [
      "Seized main shutoff valves that fail when an emergency leak happens",
      "Sediment buildup inside overhead tanks clogging showerheads and mixers",
      "Early weeping at flexible braided hoses before they burst",
    ],
    beforeArrivalSteps: [
      "List any slow drains, noisy pumps, or stiff valves you want checked during the visit.",
    ],
    faqs: [
      {
        question: "What does a preventative plumbing check cover?",
        answer:
          "Our technician checks visible supply lines, shutoff valves, toilet cisterns, tap cartridges, tank connectors, pump pressure cycling, and drainage traps, then quotes any needed repairs.",
      },
    ],
    relatedSlugs: [
      "leak-detection-repairs",
      "water-storage-supply-systems",
      "pump-installation-repairs",
    ],
  },
};
