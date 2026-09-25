 ## A. Purpose and scope — answer these first

  1. Who is the primary customer for the operational product: the municipality, Cascais Próxima, the contracted company, or a joint team?
  2. What decision must the first version help staff make that they cannot make reliably today?
  3. Is the first deliverable a demonstration using historical data, a supervised pilot, or a tool used for real municipal collections?
  4. Are bicycles the only vehicles in scope for the first version?
  5. Which geographic area is in scope? Can a route or case cross the Cascais municipal boundary?
  6. Is municipal collection limited to bicycles that the company has failed to recover, as the proposal assumes?
  7. Who has legal and operational authority to approve a municipal pickup?
  8. What exact event makes a bicycle eligible for municipal action? Is “outside for more than 120 minutes” sufficient, or does a separate company response period apply?
  9. What evidence must exist before the municipality can notify the company?
  10. What evidence must exist before the municipality can dispatch a collection operator?
  11. Can staff override an automated decision? Who may do so, and must they give a reason?
  12. What should happen when evidence is convincing but incomplete?
  13. What should happen if the company disputes a case before pickup?
  14. What is the single most important outcome of the pilot: faster recovery, fewer wasted visits, better evidence, lower cost, or something else?
  15. Which parts of the proposed workflow are already agreed with municipal staff, and which are only assumptions?

  ## B. Parking and abandonment rules

  16. Is the permitted parking area always each station_area polygon plus a 30-metre buffer?
  17. Do other geofencing rules change where a bicycle may legally remain?
  18. Does the rule vary by bicycle type, station, time of day, or special event?
  19. If station boundaries change, which version applies to an older observation?
  20. Does a bicycle exactly on the buffer boundary count as inside?
  21. How should uncertain GPS positions near that boundary be handled?
  22. Does the 120-minute clock start at trip end, the first outside position, or another event?
  23. Does “more than 120 minutes” mean action begins at 120 minutes and one second?
  24. Which events stop or reset the clock: a new trip, movement, reservation, provider pickup, or loss of contact?
  25. If a bicycle moves between two outside locations, is that one case or two?
  26. Can a bicycle be considered abandoned on private or inaccessible land, even if municipal staff cannot collect it?
  27. Are there exceptions for breakdowns, emergencies, severe weather, or provider maintenance?

  ## C. Vehicle identity, data, and evidence

  28. Can the provider supply a stable vehicle identifier for both historical and live events?
  29. Which vehicle events can the provider share: trip start/end, location, pickup, drop-off, repair, and removal?
  30. How often are positions recorded, and how late can events arrive?
  31. What does each provider event type mean in operational terms?
  32. Which event proves that the company physically recovered a bicycle?
  33. Can the provider share location accuracy or confidence with each observation?
  34. Can staff see the original observations behind a detection decision?
  35. How many observations are required to support continuous parking for more than 120 minutes?
  36. Should a gap with no observations count as continued parking, uncertainty, or a reason to close the case?
  37. How should failed unlocks and cancelled trips affect a parking interval?
  38. How should duplicate events, incorrect clocks, and late corrections be handled?
  39. Can a staff member add a field observation or photograph as evidence?
  40. What evidence is needed to mark a case verified, supported, or needs field check?
  41. How long must case evidence be kept, and who may view it?

  ## D. Case review and decisions

  42. Should every detected case appear in a review queue, or only cases above a confidence threshold?
  43. Who reviews new cases, and during which hours?
  44. What information must a reviewer see before approving or rejecting a case?
  45. Can reviewers merge duplicate cases involving the same bicycle?
  46. Can they correct a location or vehicle ID without deleting the original record?
  47. Which case states are useful to staff, and which proposed states in the document are unnecessary?
  48. What reasons must be available when a case is rejected, cancelled, or reopened?
  49. Can a case be reopened after “not found” or company recovery?
  50. Who resolves disagreements between field observations and provider records?
  51. Should every approval, edit, and override retain the actor, time, and reason?

  ## E. Company notification and coordination

  52. Who sends the company a notice: the system automatically or a municipal reviewer?
  53. What information must the notice include?
  54. Which channel is authoritative for notice and acknowledgement?
  55. When does the company response period begin?
  56. Is acknowledgement required, or does sending the notice start the clock?
  57. Can the company report “recovering,” “recovered,” “not found,” or “disputed”? What proof accompanies each status?
  58. How recently must company status be checked before municipal dispatch?
  59. What happens if the company reports recovery while a municipal operator is already travelling?
  60. What happens if municipal and company crews arrive at the same bicycle?
  61. Who may resolve conflicting claims about who collected it?

  ## F. Dispatch and route planning

  62. Who creates a mission, and can it be created automatically?
  63. Must every mission start and end at the Complexo Multisserviços depot?
  64. What is the correct vehicle entrance and loading point?
  65. How many operators and collection vehicles may work at once?
  66. What is each vehicle’s safe bicycle capacity?
  67. Are there shift limits, breaks, service hours, or maximum driving times?
  68. How long does a typical pickup take, and does that vary by bicycle condition?
  69. Which cases take priority: oldest, safety obstruction, distance, contractual deadline, or another rule?
  70. May a mission include uncertain cases for field verification without authorizing pickup?
  71. Can an operator make multiple depot trips in one shift?
  72. Who can add or remove stops from an active mission?
  73. When should the route recalculate, and when should the current stop remain fixed?
  74. What should the operator see when a route changes?
  75. What makes a route unacceptable even if its calculated travel time is short?
  76. Should staff be able to choose between a suggested route and a manually ordered route?

  ## G. Field operator app

  77. What device will operators use: phone, tablet, vehicle display, or paper backup?
  78. What must the operator see before leaving the depot?
  79. Must the operator explicitly accept a mission and record departure?
  80. What information is needed at each stop: photo, vehicle ID, last position, access notes, and company status?
  81. How should the operator confirm that the bicycle found is the one in the case?
  82. Which stop outcomes are required: picked up, not found, in use, company recovered, unsafe, inaccessible, or unable to load?
  83. Which outcomes require a photo, note, or supervisor approval?
  84. What should happen if the bicycle is several metres from its reported position?
  85. What should happen if the operator finds multiple bicycles at one location?
  86. Can an operator collect a bicycle that was not on the assigned route?
  87. How should the app behave without mobile connectivity?
  88. What should happen if the operator cannot stop or park safely?
  89. What safety instructions are required for damaged bicycles or batteries?
  90. Must the operator record condition or damage before loading?
  91. What is the escalation path for an accident, dispute with a member of the public, or suspected theft?

  ## H. Depot and custody

  92. Who checks bicycles into the depot: the driver, depot staff, or both?
  93. Which details must be recorded at check-in: ID, condition, photos, time, storage position, and accessories?
  94. How are collected bicycles matched to the route manifest?
  95. What happens if the manifest and physical count differ?
  96. Who is responsible for a bicycle while it is stored at the depot?
  97. How and when is the company told that its bicycle is ready for collection?
  98. What proof is required when custody transfers back to the company?
  99. What happens when the company does not collect a bicycle by the required date?
  100. Are there separate procedures for damaged, unidentified, or hazardous bicycles?

  ## I. Apps, permissions, and pilot acceptance

  101. Do dispatchers, field operators, depot staff, managers, and company staff need separate views?
  102. Which roles may see a case, approve pickup, edit evidence, change a route, or close a case?
  103. Does the company need access to the product, or will communication happen through an existing channel?
  104. Which languages must the staff interfaces support?
  105. What information must be visible on a map, and what must also work as a list?
  106. Which actions must work offline and synchronize later?
  107. Which notifications are genuinely time sensitive, and who receives them?
  108. What records must staff be able to search and export?
  109. What errors would make the pilot unsafe or unusable?
  110. What measurable results would count as pilot success: detection accuracy, fewer failed visits, depot reconciliation, time to pickup, or staff satisfaction?
  111. Who signs off the operational requirements and the supervised pilot?

  ## J. Questions that connect to the later analytics product

  112. Which operational events should become official measures of company performance?
  113. Should analytics show candidate cases, verified cases, and completed municipal pickups separately?
  114. Which costs can be measured from actual records, and which would be estimates?
  115. What information may be used for a contractual penalty, and who approves that determination?
  116. Which operational reports must be available daily to dispatchers versus monthly to managers?
  117. Should station planning use unresolved parking cases as one signal, and who reviews the other evidence before proposing a station?
  118. What decisions should the analytics product support first: contract oversight, recovery cost, station balancing, or new station locations?