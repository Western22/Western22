-- =============================================================================
-- Seed: popular, globally diverse goals (212 including the 20 from 0003).
-- Reference data, so it ships as a migration and reaches production.
-- Columns: slug, category, English title, English description,
--          region, place country, place name, lat, lng, best months.
-- region null = can be done anywhere. Months are local calendar months.
-- TODO(goal-photos): add licensed photos (photo_url + photo_credit).
-- =============================================================================

create temporary table goal_seed (
  slug text, category text, title text, description text,
  region text, country text, place text, lat double precision, lng double precision, months smallint[]
) on commit drop;

insert into goal_seed values
-- The original 20 (from 0003), now with descriptions and facets.
('see-the-northern-lights','nature','See the Northern Lights','Watch the aurora ripple across a dark Arctic sky. Northern Norway, Iceland, Finland and Canada are best on clear winter nights.','europe','NO','Tromsø',69.6492,18.9553,'{9,10,11,12,1,2,3}'),
('climb-mount-kilimanjaro','adventure','Climb Mount Kilimanjaro','Trek through rainforest, moorland and glacier to Uhuru Peak, the roof of Africa at 5,895 m.','africa','TZ','Mount Kilimanjaro',-3.0674,37.3556,'{1,2,6,7,8,9,10}'),
('learn-tango-in-buenos-aires','learning','Learn tango in Buenos Aires','Take classes in the city where tango was born, then try your steps at a late-night milonga.','south_america','AR','Buenos Aires',-34.6037,-58.3816,'{3,4,5,9,10,11}'),
('go-skydiving','adventure','Go skydiving','Jump from 4,000 m with an instructor and free fall for almost a minute before the parachute opens.',null,null,null,null,null,null),
('dive-the-great-barrier-reef','nature','Dive the Great Barrier Reef','Explore the world''s largest coral reef system, home to turtles, reef sharks and thousands of fish species.','oceania','AU','Great Barrier Reef',-18.2871,147.6992,'{6,7,8,9,10,11}'),
('hike-the-inca-trail','travel','Hike the Inca Trail to Machu Picchu','Walk four days on ancient stone paths through cloud forest and arrive at Machu Picchu through the Sun Gate.','south_america','PE','Machu Picchu',-13.1631,-72.5450,'{4,5,6,7,8,9,10}'),
('run-a-marathon','sport','Run a marathon','Train for months and cross the finish line of a full 42.2 km race, at home or somewhere iconic.',null,null,null,null,null,null),
('learn-to-surf','sport','Learn to surf','Go from tumbling in the whitewash to standing up and riding your first clean wave.',null,null,null,null,null,null),
('see-cherry-blossoms-in-japan','culture','See the cherry blossoms in Japan','Join the hanami tradition of picnicking under blooming sakura in Kyoto, Tokyo or the countryside.','asia','JP','Kyoto',35.0116,135.7681,'{3,4}'),
('hot-air-balloon-in-cappadocia','adventure','Ride a hot air balloon in Cappadocia','Float at sunrise over fairy chimneys and cave villages alongside a hundred other balloons.','middle_east','TR','Cappadocia',38.6431,34.8289,'{4,5,6,9,10}'),
('safari-in-the-serengeti','nature','Go on safari in the Serengeti','Watch lions, elephants and the Great Migration of more than a million wildebeest crossing the plains.','africa','TZ','Serengeti',-2.3333,34.8333,'{1,2,6,7,8,9,10}'),
('become-fluent-in-a-new-language','learning','Become fluent in a new language','Reach the point where you can hold a real conversation, tell a joke and even dream in another language.',null,null,null,null,null,null),
('drive-route-66','travel','Drive Route 66','Road-trip almost 4,000 km from Chicago to Santa Monica past diners, neon motels and desert towns.','north_america','US','Route 66',35.1983,-111.6513,'{5,6,9,10}'),
('visit-antarctica','travel','Visit Antarctica','Cross the Drake Passage to the White Continent for penguins, icebergs and total silence.','antarctica','AQ','Antarctic Peninsula',-64.0,-60.0,'{11,12,1,2,3}'),
('celebrate-carnival-in-rio','culture','Celebrate Carnival in Rio','Dance with a samba school, join the street blocos and watch the parades at the Sambadrome.','south_america','BR','Rio de Janeiro',-22.9068,-43.1729,'{2,3}'),
('cooking-class-in-italy','food','Take a cooking class in Italy','Learn to make fresh pasta and regional dishes from a local cook, then eat what you made.','europe','IT','Tuscany',43.7711,11.2486,'{4,5,6,9,10}'),
('swim-with-whale-sharks','nature','Swim with whale sharks','Snorkel beside the biggest fish in the sea, in Mexico, the Philippines, Mozambique or Western Australia.',null,null,null,null,null,null),
('trek-to-everest-base-camp','adventure','Trek to Everest Base Camp','Hike for about two weeks through Sherpa villages and monasteries to the foot of the world''s highest mountain.','asia','NP','Everest Base Camp',28.0026,86.8528,'{3,4,5,10,11}'),
('sleep-under-the-sahara-stars','nature','Sleep under the stars in the Sahara','Ride into the dunes, eat by a campfire and sleep under one of the darkest, starriest skies on Earth.','africa','MA','Erg Chebbi, Merzouga',31.1499,-3.9744,'{10,11,12,1,2,3,4}'),
('learn-to-play-guitar','creative','Learn to play the guitar','Go from your first chords to playing a whole song for your friends.',null,null,null,null,null,null),

-- Travel
('walk-through-the-siq-to-petra','travel','Walk through the Siq to Petra','Follow the narrow canyon to the rose-red Treasury, then climb the steps to the Monastery for the view.','middle_east','JO','Petra',30.3285,35.4444,'{3,4,5,10,11}'),
('see-the-taj-mahal-at-sunrise','travel','See the Taj Mahal at sunrise','Watch the marble glow pink and gold as the sun comes up over the Yamuna river.','asia','IN','Agra',27.1751,78.0421,'{10,11,12,1,2,3}'),
('explore-the-temples-of-angkor','travel','Explore the temples of Angkor','Cycle between jungle-wrapped temples and watch sunrise behind the towers of Angkor Wat.','asia','KH','Siem Reap',13.4125,103.8670,'{11,12,1,2,3}'),
('walk-the-great-wall-of-china','travel','Walk the Great Wall of China','Hike a restored or wild section of the wall as it winds over green mountain ridges.','asia','CN','Mutianyu',40.4319,116.5704,'{4,5,9,10}'),
('ride-the-trans-siberian-railway','travel','Ride the Trans-Siberian Railway','Cross a continent by train from Moscow to Vladivostok, past Lake Baikal and endless birch forest.','asia','RU','Irkutsk',52.2870,104.3050,'{5,6,7,8,9}'),
('drive-icelands-ring-road','travel','Drive Iceland''s Ring Road','Circle the island past waterfalls, black-sand beaches, glaciers and steaming hot springs.','europe','IS','Iceland',64.9631,-19.0208,'{6,7,8,9}'),
('island-hop-in-greece','travel','Island-hop in Greece','Take ferries between whitewashed villages, quiet coves and tavernas in the Cyclades.','europe','GR','Cyclades',37.0,25.15,'{5,6,9,10}'),
('see-the-pyramids-of-giza','travel','See the Pyramids of Giza','Stand at the foot of the last surviving wonder of the ancient world, then meet the Sphinx.','africa','EG','Giza',29.9792,31.1342,'{10,11,12,1,2,3}'),
('explore-the-galapagos-islands','travel','Explore the Galápagos Islands','Snorkel with sea lions and walk among giant tortoises and blue-footed boobies that have no fear of people.','south_america','EC','Galápagos Islands',-0.9538,-90.9656,null),
('see-iguazu-falls','travel','See Iguazú Falls','Feel the spray from 275 waterfalls thundering into the Devil''s Throat on the Argentina–Brazil border.','south_america','AR','Iguazú Falls',-25.6953,-54.4367,'{3,4,5,8,9,10}'),
('watch-sunrise-over-bagan','travel','Watch sunrise over the temples of Bagan','See thousands of ancient pagodas emerge from the morning mist across the plain.','asia','MM','Bagan',21.1717,94.8585,'{11,12,1,2}'),
('see-victoria-falls','travel','See Victoria Falls','Walk the rainforest paths opposite "the smoke that thunders", one of the largest waterfalls on Earth.','africa','ZM','Victoria Falls',-17.9243,25.8572,'{2,3,4,5,6}'),
('get-lost-in-the-marrakech-medina','travel','Get lost in the Marrakech medina','Wander the souks, sip mint tea on a rooftop and watch Jemaa el-Fnaa come alive at night.','africa','MA','Marrakech',31.6295,-7.9811,'{3,4,5,10,11}'),
('cruise-ha-long-bay','travel','Cruise Ha Long Bay','Sleep on a junk boat among thousands of limestone islands rising from emerald water.','asia','VN','Ha Long Bay',20.9101,107.1839,'{3,4,5,9,10,11}'),
('cruise-milford-sound','travel','Cruise Milford Sound','Sail beneath sheer cliffs and waterfalls in New Zealand''s most dramatic fjord.','oceania','NZ','Milford Sound',-44.6414,167.8974,'{12,1,2,3}'),
('see-uluru-at-sunset','travel','See Uluru at sunset','Watch the great sandstone monolith turn from ochre to deep red in the heart of Australia.','oceania','AU','Uluru',-25.3444,131.0369,'{5,6,7,8,9}'),
('explore-havana-in-a-classic-car','travel','Explore Havana in a classic car','Cruise the Malecón in a 1950s convertible, then dance to live son in Old Havana.','central_america_caribbean','CU','Havana',23.1136,-82.3666,'{12,1,2,3,4}'),
('visit-chichen-itza','travel','Visit Chichén Itzá','Explore the great Maya city and its stepped pyramid, El Castillo, in the Yucatán jungle.','north_america','MX','Chichén Itzá',20.6843,-88.5678,'{11,12,1,2,3}'),
('see-the-salar-de-uyuni-mirror','travel','See the mirror of Salar de Uyuni','Stand on the world''s largest salt flat when a thin layer of rain turns it into a giant mirror.','south_america','BO','Salar de Uyuni',-20.1338,-67.4891,'{1,2,3}'),
('travel-the-silk-road-in-uzbekistan','travel','Travel the Silk Road through Uzbekistan','See the tiled domes and madrasas of Samarkand, Bukhara and Khiva.','asia','UZ','Samarkand',39.6270,66.9750,'{4,5,9,10}'),
('visit-all-seven-continents','travel','Visit all seven continents','Set foot on every continent, from Africa to Antarctica.',null,null,null,null,null,null),
('backpack-through-southeast-asia','travel','Backpack through Southeast Asia','Travel overland through Thailand, Laos, Vietnam and Cambodia on a shoestring.','asia',null,null,null,null,'{11,12,1,2,3}'),
('take-a-year-off-to-travel','travel','Take a year off to travel','Press pause on everyday life and spend a whole year exploring the world.',null,null,null,null,null,null),
('stay-in-an-overwater-villa-in-the-maldives','travel','Stay in an overwater villa in the Maldives','Wake up above a turquoise lagoon and snorkel straight off your deck.','asia','MV','Maldives',3.2028,73.2207,'{12,1,2,3,4}'),
('sail-the-norwegian-fjords','travel','Sail the Norwegian fjords','Glide past waterfalls and cliffs in Geirangerfjord and Nærøyfjord.','europe','NO','Geirangerfjord',62.1015,7.0941,'{5,6,7,8,9}'),
('see-the-rock-churches-of-lalibela','travel','See the rock churches of Lalibela','Visit eleven churches carved out of solid rock in the Ethiopian highlands.','africa','ET','Lalibela',12.0317,39.0473,'{10,11,12,1}'),
('ride-the-glacier-express','travel','Ride the Glacier Express','Take the slow panoramic train across the Swiss Alps from Zermatt to St. Moritz.','europe','CH','Zermatt',46.0207,7.7491,'{6,7,8,9,12,1,2}'),
('wander-stone-town-zanzibar','travel','Wander Stone Town in Zanzibar','Explore carved wooden doors, spice markets and sunset dhows on the Indian Ocean.','africa','TZ','Stone Town, Zanzibar',-6.1630,39.1880,'{6,7,8,9,10,12,1,2}'),
('camp-in-omans-wahiba-sands','travel','Camp in Oman''s Wahiba Sands','Drive into golden dunes, meet Bedouin hosts and camp under the desert sky.','middle_east','OM','Wahiba Sands',22.0,58.75,'{11,12,1,2,3}'),
('see-lake-louise-in-banff','travel','See Lake Louise in Banff','Paddle a canoe on the glacier-blue lake beneath the Rocky Mountains.','north_america','CA','Banff National Park',51.4254,-116.1773,'{6,7,8,9}'),
('visit-new-york-city','travel','Visit New York City','See the skyline from the Brooklyn Bridge, wander Central Park and eat your way through the boroughs.','north_america','US','New York City',40.7128,-74.0060,null),
('see-the-grand-canyon','travel','See the Grand Canyon','Watch the light change across a mile-deep canyon, or hike down to the Colorado River.','north_america','US','Grand Canyon',36.1069,-112.1129,'{4,5,9,10}'),

-- Adventure
('go-bungee-jumping','adventure','Go bungee jumping','Stand on the edge, take a deep breath and jump.',null,null,null,null,null,null),
('paraglide-over-oludeniz','adventure','Paraglide over Ölüdeniz','Fly tandem from Babadağ mountain over the Blue Lagoon on Turkey''s coast.','middle_east','TR','Ölüdeniz',36.5490,29.1240,'{5,6,7,8,9,10}'),
('climb-mount-fuji','adventure','Climb Mount Fuji','Hike through the night to watch sunrise from the summit of Japan''s sacred volcano.','asia','JP','Mount Fuji',35.3606,138.7274,'{7,8}'),
('walk-the-camino-de-santiago','adventure','Walk the Camino de Santiago','Walk the ancient pilgrim route across Spain to Santiago de Compostela, one village at a time.','europe','ES','Santiago de Compostela',42.8782,-8.5448,'{4,5,6,9,10}'),
('hike-torres-del-paine','adventure','Hike Torres del Paine','Trek the W or O circuit past granite towers, glaciers and turquoise lakes in Patagonia.','south_america','CL','Torres del Paine',-50.9423,-73.4068,'{11,12,1,2,3}'),
('raft-the-zambezi-river','adventure','Raft the Zambezi River','Take on some of the world''s wildest commercial rapids below Victoria Falls.','africa','ZW','Batoka Gorge',-17.9300,25.8400,'{8,9,10,11,12}'),
('cage-dive-with-great-white-sharks','adventure','Cage dive with great white sharks','Come face to face with a great white from the safety of a steel cage.','africa','ZA','Gansbaai',-34.5822,19.3519,'{5,6,7,8,9}'),
('climb-mount-kinabalu','adventure','Climb Mount Kinabalu','Summit Borneo''s highest peak at dawn, above a sea of clouds.','asia','MY','Mount Kinabalu',6.0753,116.5588,'{3,4,5,6,7,8,9}'),
('learn-to-scuba-dive','adventure','Learn to scuba dive','Get certified and breathe underwater among coral, turtles and rays.',null,null,null,null,null,null),
('sandboard-the-dunes-of-namibia','adventure','Sandboard the dunes of Namibia','Climb the red dunes of Sossusvlei and slide all the way down.','africa','NA','Sossusvlei',-24.7275,15.3428,'{5,6,7,8,9}'),
('ski-in-the-alps','adventure','Ski in the Alps','Carve fresh powder under Mont Blanc and finish the day with fondue.','europe','FR','Chamonix',45.9237,6.8694,'{12,1,2,3}'),
('climb-a-frozen-waterfall','adventure','Climb a frozen waterfall','Learn to use ice axes and crampons on a frozen cascade.',null,null,null,null,null,null),
('kayak-with-orcas','adventure','Kayak with orcas in British Columbia','Paddle Johnstone Strait while orca pods surface nearby.','north_america','CA','Johnstone Strait',50.5,-126.5,'{7,8,9}'),
('climb-mount-kenya','adventure','Climb Mount Kenya','Trek through bamboo forest and alpine moorland to Point Lenana at 4,985 m.','africa','KE','Mount Kenya',-0.1521,37.3084,'{1,2,7,8,9}'),
('experience-zero-gravity','adventure','Experience zero gravity','Float weightless on a parabolic flight, the closest you can get to space without a rocket.',null,null,null,null,null,null),
('go-canyoning','adventure','Go canyoning','Abseil down waterfalls, slide down rock chutes and jump into deep pools.',null,null,null,null,null,null),
('walk-the-annapurna-circuit','adventure','Walk the Annapurna Circuit','Trek around the Annapurna massif and cross the Thorong La pass at 5,416 m.','asia','NP','Annapurna',28.5960,83.8203,'{3,4,10,11}'),
('camp-in-wadi-rum','adventure','Camp in Wadi Rum','Explore the red desert valleys by jeep or camel and sleep in a Bedouin camp.','middle_east','JO','Wadi Rum',29.5730,35.4210,'{3,4,5,10,11}'),
('hike-on-a-patagonian-glacier','adventure','Hike on a glacier in Patagonia','Strap on crampons and walk across the Perito Moreno glacier.','south_america','AR','Perito Moreno Glacier',-50.4967,-73.1377,'{10,11,12,1,2,3}'),
('ride-the-ha-giang-loop','adventure','Ride the Ha Giang Loop by motorbike','Ride mountain passes and rice terraces in Vietnam''s far north.','asia','VN','Ha Giang',22.8233,104.9836,'{10,11,12,3,4}'),
('climb-a-via-ferrata-in-the-dolomites','adventure','Climb a via ferrata in the Dolomites','Clip into steel cables and climb spectacular rock faces in the Italian Alps.','europe','IT','Dolomites',46.4102,11.8440,'{6,7,8,9}'),
('go-storm-chasing','adventure','Go storm chasing','Join a guided tour across the Great Plains to see supercells and tornadoes from a safe distance.','north_america','US','Great Plains',36.0,-98.0,'{4,5,6}'),
('hike-the-drakensberg','adventure','Hike the Drakensberg','Hike the dragon mountains, with the Amphitheatre cliffs and ancient San rock art.','africa','ZA','Drakensberg',-29.0,29.25,'{3,4,5,9,10}'),
('sail-across-an-ocean','adventure','Sail across an ocean','Crew a sailboat across the Atlantic or Pacific with nothing but sea around you.',null,null,null,null,null,null),
('sleep-in-an-ice-hotel','adventure','Spend a night in an ice hotel','Sleep on a bed of ice under reindeer skins in Swedish Lapland.','europe','SE','Jukkasjärvi',67.8496,20.5950,'{12,1,2,3}'),
('hike-the-pacific-crest-trail','adventure','Hike the Pacific Crest Trail','Walk some or all of the 4,265 km trail from Mexico to Canada.','north_america','US','Pacific Crest Trail',41.0,-121.0,'{4,5,6,7,8,9}'),
('volcano-board-cerro-negro','adventure','Volcano board down Cerro Negro','Hike up an active volcano in Nicaragua and slide down its black ash slope.','central_america_caribbean','NI','Cerro Negro',12.5064,-86.7020,'{11,12,1,2,3,4}'),

-- Nature
('trek-to-see-mountain-gorillas','nature','Trek to see mountain gorillas','Hike into the misty forest and spend an hour with a gorilla family.','africa','RW','Volcanoes National Park',-1.4686,29.5060,'{6,7,8,9,12,1,2}'),
('explore-the-okavango-delta','nature','Explore the Okavango Delta','Glide through the channels in a mokoro canoe past elephants, hippos and lions.','africa','BW','Okavango Delta',-19.2833,22.9,'{6,7,8,9,10}'),
('see-a-total-solar-eclipse','nature','See a total solar eclipse','Watch day turn to night for a few minutes as the moon covers the sun.',null,null,null,null,null,null),
('watch-sea-turtles-hatch','nature','Watch sea turtles hatch','See baby turtles dig out of the sand and race to the sea at night.','central_america_caribbean','CR','Tortuguero',10.5427,-83.5024,'{7,8,9,10}'),
('swim-in-a-bioluminescent-bay','nature','Swim in a bioluminescent bay','Watch the water light up blue-green with every stroke on a moonless night.','central_america_caribbean','PR','Mosquito Bay, Vieques',18.0960,-65.4430,null),
('go-whale-watching','nature','Go whale watching','See humpbacks breach and blue whales surface on the open ocean.',null,null,null,null,null,null),
('see-the-lavender-fields-of-provence','nature','See the lavender fields of Provence','Walk through rows of purple lavender on the Valensole plateau.','europe','FR','Valensole',43.8379,5.9830,'{6,7}'),
('visit-yellowstone','nature','Visit Yellowstone','See Old Faithful erupt, rainbow hot springs and roaming bison.','north_america','US','Yellowstone National Park',44.4280,-110.5885,'{5,6,7,8,9}'),
('explore-the-amazon-rainforest','nature','Explore the Amazon rainforest','Stay in a jungle lodge, spot pink river dolphins and listen to the forest at night.','south_america','BR','Manaus',-3.1190,-60.0217,null),
('see-penguins-at-boulders-beach','nature','See the penguins at Boulders Beach','Watch African penguins waddle across the sand near Cape Town.','africa','ZA','Boulders Beach',-34.1975,18.4511,null),
('hike-among-the-zhangjiajie-pillars','nature','Hike among the Zhangjiajie pillars','Walk among towering sandstone pillars that inspired the floating mountains of Avatar.','asia','CN','Zhangjiajie',29.3249,110.4343,'{4,5,9,10}'),
('see-komodo-dragons','nature','See Komodo dragons','Trek with a ranger to see the world''s largest lizard in the wild.','asia','ID','Komodo National Park',-8.5500,119.4890,'{4,5,6,7,8,9,10,11}'),
('see-orangutans-in-borneo','nature','See orangutans in Borneo','Watch orangutans swing through the rainforest canopy.','asia','MY','Sepilok',5.8646,117.9500,'{3,4,5,6,7,8,9,10}'),
('stargaze-in-the-atacama-desert','nature','Stargaze in the Atacama Desert','See the Milky Way blaze across some of the clearest skies on Earth.','south_america','CL','San Pedro de Atacama',-22.9087,-68.1997,'{3,4,5,6,7,8,9,10,11}'),
('see-synchronous-fireflies','nature','See the synchronous fireflies','Watch thousands of fireflies flash in unison in the Great Smoky Mountains.','north_america','US','Great Smoky Mountains',35.6532,-83.5070,'{6}'),
('swim-in-a-cenote','nature','Swim in a cenote','Dive into a crystal-clear sinkhole lit by shafts of sunlight.','north_america','MX','Yucatán',20.6500,-87.8,null),
('see-the-tsingy-of-madagascar','nature','See the Tsingy of Madagascar','Cross rope bridges over a forest of razor-sharp limestone needles.','africa','MG','Tsingy de Bemaraha',-18.75,44.75,'{5,6,7,8,9,10,11}'),
('see-the-danakil-depression','nature','See the Danakil Depression','Walk among neon-yellow sulfur springs in one of the hottest places on Earth.','africa','ET','Danakil Depression',14.2417,40.3000,'{11,12,1,2}'),
('watch-sunrise-over-mount-bromo','nature','Watch sunrise over Mount Bromo','See the smoking volcano emerge from a sea of sand and cloud at dawn.','asia','ID','Mount Bromo',-7.9425,112.9530,'{4,5,6,7,8,9,10}'),
('see-the-dutch-tulip-fields','nature','See the tulip fields in the Netherlands','Cycle past striped fields of tulips in full bloom.','europe','NL','Lisse',52.2580,4.5570,'{4,5}'),
('spot-a-snow-leopard','nature','Spot a snow leopard in Ladakh','Track the elusive grey ghost with local guides in the Himalaya.','asia','IN','Hemis National Park',34.15,77.58,'{1,2,3}'),

-- Learning
('learn-sign-language','learning','Learn sign language','Learn to hold a conversation in your local sign language.',null,null,null,null,null,null),
('learn-to-code','learning','Learn to code','Build your first website or app from scratch.',null,null,null,null,null,null),
('learn-to-fly-a-plane','learning','Learn to fly a plane','Take the controls and earn your private pilot''s license.',null,null,null,null,null,null),
('learn-to-swim','learning','Learn to swim','Get comfortable in the water and swim your first full length.',null,null,null,null,null,null),
('study-abroad','learning','Study abroad','Spend a semester or a year studying in another country.',null,null,null,null,null,null),
('learn-mandarin','learning','Learn Mandarin','Learn the tones, the characters and enough to chat with a stranger.',null,null,null,null,null,null),
('learn-japanese-in-japan','learning','Learn Japanese in Japan','Take a language course in Tokyo and practise in the izakayas.','asia','JP','Tokyo',35.6762,139.6503,null),
('learn-spanish-in-oaxaca','learning','Learn Spanish in Oaxaca','Study Spanish with a homestay family in colourful Oaxaca.','north_america','MX','Oaxaca',17.0732,-96.7266,null),
('learn-swahili-in-zanzibar','learning','Learn Swahili in Zanzibar','Take Kiswahili lessons on the island where the language grew up.','africa','TZ','Zanzibar',-6.1659,39.2026,null),
('learn-the-night-sky','learning','Learn the night sky','Learn to find the planets, constellations and the Milky Way.',null,null,null,null,null,null),
('learn-to-ride-a-horse','learning','Learn to ride a horse','Go from your first lesson to a confident canter across open country.',null,null,null,null,null,null),
('learn-salsa-in-cali','learning','Learn salsa in Cali','Take classes in the world capital of salsa, then hit the dance floor.','south_america','CO','Cali',3.4516,-76.5320,null),
('learn-flamenco-in-seville','learning','Learn flamenco in Seville','Learn the footwork and palmas of flamenco in its Andalusian home.','europe','ES','Seville',37.3891,-5.9845,'{3,4,5,10,11}'),
('train-kung-fu-at-shaolin','learning','Train in kung fu at Shaolin','Train with masters near the Shaolin Temple, the birthplace of kung fu.','asia','CN','Dengfeng',34.5070,112.9350,null),
('learn-muay-thai-in-thailand','learning','Learn Muay Thai in Thailand','Train at a traditional camp in the home of the art of eight limbs.','asia','TH','Bangkok',13.7563,100.5018,null),
('learn-capoeira-in-salvador','learning','Learn capoeira in Salvador','Join a roda in Bahia, where capoeira''s music and movement were born.','south_america','BR','Salvador',-12.9777,-38.5016,null),
('learn-to-sail','learning','Learn to sail','Learn the ropes and skipper a small boat on your own.',null,null,null,null,null,null),
('learn-first-aid','learning','Learn first aid','Know what to do in an emergency, from CPR to treating a burn.',null,null,null,null,null,null),

-- Creative
('write-a-book','creative','Write a book','Finish the novel, memoir or guide you''ve always talked about.',null,null,null,null,null,null),
('learn-watercolor-painting','creative','Learn watercolor painting','Fill a sketchbook with watercolors of places you love.',null,null,null,null,null,null),
('learn-to-play-the-piano','creative','Learn to play the piano','Play a piece you love from start to finish.',null,null,null,null,null,null),
('write-and-record-a-song','creative','Write and record a song','Write your own song and record it, even if it''s just on your phone.',null,null,null,null,null,null),
('make-a-short-film','creative','Make a short film','Write, shoot and edit your own short film and screen it for friends.',null,null,null,null,null,null),
('make-pottery-on-a-wheel','creative','Make pottery on a wheel','Throw, trim and glaze your own mug or bowl.',null,null,null,null,null,null),
('photograph-the-milky-way','creative','Photograph the Milky Way','Learn long-exposure photography under a truly dark sky.',null,null,null,null,null,null),
('perform-stand-up-comedy','creative','Perform stand-up comedy','Write a five-minute set and perform it at an open mic.',null,null,null,null,null,null),
('act-in-a-play','creative','Act in a play','Join a community theatre and take the stage on opening night.',null,null,null,null,null,null),
('knit-a-sweater','creative','Knit a sweater','Knit a whole sweater you''re proud to wear.',null,null,null,null,null,null),
('paint-a-mural','creative','Paint a mural','Design and paint a large mural on a real wall.',null,null,null,null,null,null),
('start-a-podcast','creative','Start a podcast','Record and publish the first season of your own show.',null,null,null,null,null,null),
('learn-calligraphy-in-japan','creative','Learn calligraphy in Japan','Learn shodo, the art of brush calligraphy, from a master in Kyoto.','asia','JP','Kyoto',35.0116,135.7681,null),
('paint-in-paris','creative','Take a painting course in Paris','Set up an easel by the Seine and paint like the Impressionists.','europe','FR','Paris',48.8566,2.3522,'{4,5,6,9}'),
('build-your-own-furniture','creative','Build your own furniture','Design and build a table, chair or bookshelf with your own hands.',null,null,null,null,null,null),
('learn-to-dj','creative','Learn to DJ','Learn to mix and play a set for a crowd.',null,null,null,null,null,null),

-- Food
('eat-street-food-in-bangkok','food','Eat street food in Bangkok','Graze through night markets on pad thai, som tam and mango sticky rice.','asia','TH','Bangkok',13.7563,100.5018,null),
('learn-thai-cooking-in-chiang-mai','food','Learn Thai cooking in Chiang Mai','Shop at a local market, then cook curries and stir-fries at a farm school.','asia','TH','Chiang Mai',18.7883,98.9853,'{11,12,1,2}'),
('eat-sushi-at-a-tokyo-fish-market','food','Eat sushi at a Tokyo fish market','Have the freshest sushi breakfast of your life at Toyosu market.','asia','JP','Toyosu, Tokyo',35.6458,139.7849,null),
('taste-wine-in-bordeaux','food','Taste wine in Bordeaux','Cycle between châteaux and taste grand cru wines during harvest.','europe','FR','Bordeaux',44.8378,-0.5792,'{9,10}'),
('eat-pizza-in-naples','food','Eat pizza in Naples','Taste the original Neapolitan margherita where pizza was born.','europe','IT','Naples',40.8518,14.2681,null),
('go-on-a-pintxos-crawl-in-san-sebastian','food','Go on a pintxos crawl in San Sebastián','Hop between bars in the old town, one small plate and one glass at a time.','europe','ES','San Sebastián',43.3183,-1.9812,null),
('eat-tacos-al-pastor-in-mexico-city','food','Eat tacos al pastor in Mexico City','Find the best taquería in the city and order one more round.','north_america','MX','Mexico City',19.4326,-99.1332,null),
('learn-to-cook-jollof-in-accra','food','Learn to cook jollof rice in Accra','Learn Ghana''s smoky, spicy jollof from a home cook, then settle the jollof debate.','africa','GH','Accra',5.6037,-0.1870,null),
('join-an-ethiopian-coffee-ceremony','food','Join a coffee ceremony in Ethiopia','Watch beans roasted, ground and brewed by hand in coffee''s birthplace.','africa','ET','Addis Ababa',9.0300,38.7400,null),
('eat-a-michelin-star-tasting-menu','food','Eat a Michelin-star tasting menu','Treat yourself to a many-course tasting menu at a starred restaurant.',null,null,null,null,null,null),
('eat-dim-sum-in-hong-kong','food','Eat dim sum in Hong Kong','Point at trolleys of dumplings and buns in a busy teahouse.','asia','HK','Hong Kong',22.3193,114.1694,null),
('follow-the-scotch-whisky-trail','food','Follow the whisky trail in Scotland','Visit Speyside distilleries and taste single malts at the source.','europe','GB','Speyside',57.4,-3.2,'{5,6,7,8,9}'),
('explore-istanbuls-spice-bazaar','food','Explore Istanbul''s Spice Bazaar','Taste Turkish delight, sumac and saffron in the centuries-old market.','middle_east','TR','Istanbul',41.0165,28.9706,null),
('eat-asado-and-taste-malbec-in-mendoza','food','Eat asado and taste Malbec in Mendoza','Share a long lunch of grilled meats at a vineyard below the Andes.','south_america','AR','Mendoza',-32.8895,-68.8458,'{3,4}'),
('eat-ceviche-in-lima','food','Eat ceviche in Lima','Taste ceviche and Nikkei cooking in South America''s food capital.','south_america','PE','Lima',-12.0464,-77.0428,null),
('bake-sourdough-from-scratch','food','Bake sourdough from scratch','Raise your own starter and bake a crusty, open-crumbed loaf.',null,null,null,null,null,null),
('eat-bunny-chow-in-durban','food','Eat bunny chow in Durban','Eat Durban''s famous curry served in a hollowed-out loaf of bread.','africa','ZA','Durban',-29.8587,31.0218,null),
('hunt-for-truffles-in-alba','food','Hunt for truffles in Alba','Follow a truffle hunter and his dog through Piedmont''s autumn woods.','europe','IT','Alba',44.7007,8.0357,'{10,11}'),

-- Giving back
('volunteer-at-an-animal-sanctuary','giving_back','Volunteer at an animal sanctuary','Spend time caring for rescued animals.',null,null,null,null,null,null),
('help-build-a-home','giving_back','Help build a home','Join a community build and help a family into a safe home.',null,null,null,null,null,null),
('teach-english-abroad','giving_back','Teach English abroad','Spend a term teaching English in a community that asked for it.',null,null,null,null,null,null),
('plant-100-trees','giving_back','Plant 100 trees','Plant (or fund) a hundred trees and watch some of them grow.',null,null,null,null,null,null),
('become-a-blood-donor','giving_back','Become a regular blood donor','Give blood regularly. Each donation can help save several lives.',null,null,null,null,null,null),
('run-a-race-for-charity','giving_back','Run a race for charity','Pick a cause, train for a race and raise money with every kilometre.',null,null,null,null,null,null),
('mentor-a-young-person','giving_back','Mentor a young person','Share what you know with someone just starting out.',null,null,null,null,null,null),
('volunteer-with-sea-turtle-conservation','giving_back','Volunteer with sea turtle conservation','Patrol nesting beaches and protect turtle eggs in Costa Rica.','central_america_caribbean','CR','Tortuguero',10.5427,-83.5024,'{7,8,9,10}'),
('volunteer-at-an-ethical-elephant-sanctuary','giving_back','Volunteer at an ethical elephant sanctuary','Care for rescued elephants at a sanctuary that doesn''t allow riding.','asia','TH','Chiang Mai',18.7883,98.9853,null),
('organize-a-beach-clean-up','giving_back','Organize a beach clean-up','Gather friends and neighbours to clear plastic from a beach.',null,null,null,null,null,null),
('volunteer-at-a-food-bank','giving_back','Volunteer at a food bank','Sort, pack and hand out food to families who need it.',null,null,null,null,null,null),
('start-a-community-garden','giving_back','Start a community garden','Turn an empty lot into a garden your neighbours share.',null,null,null,null,null,null),
('foster-a-rescue-animal','giving_back','Foster a rescue animal','Give a rescued dog or cat a temporary home until they find their family.',null,null,null,null,null,null),
('teach-someone-to-read','giving_back','Teach someone to read','Volunteer as a literacy tutor for a child or adult.',null,null,null,null,null,null),
('volunteer-in-wildlife-conservation-in-kenya','giving_back','Volunteer in wildlife conservation in Kenya','Help rangers and researchers protect wildlife in Laikipia.','africa','KE','Laikipia',0.3,36.9,null),
('raise-money-for-a-cause','giving_back','Raise money for a cause you love','Set a target and fundraise for a cause close to your heart.',null,null,null,null,null,null),

-- Personal growth
('do-a-silent-meditation-retreat','personal_growth','Do a 10-day silent meditation retreat','Spend ten days in silence learning to sit with your own mind.',null,null,null,null,null,null),
('do-yoga-teacher-training-in-rishikesh','personal_growth','Do yoga teacher training in Rishikesh','Train for a month on the banks of the Ganges in the yoga capital of the world.','asia','IN','Rishikesh',30.0869,78.2676,'{2,3,4,10,11}'),
('walk-the-kumano-kodo','personal_growth','Walk the Kumano Kodo pilgrimage','Walk forest trails between ancient shrines and stay in family-run inns.','asia','JP','Kumano',33.8400,135.7700,'{3,4,5,10,11}'),
('watch-the-sunrise-for-30-days','personal_growth','Watch the sunrise for 30 days','Get up early every day for a month and see what it changes.',null,null,null,null,null,null),
('read-100-books','personal_growth','Read 100 books','Read a hundred books, from classics to things you''d never normally pick up.',null,null,null,null,null,null),
('do-a-digital-detox-month','personal_growth','Do a digital detox for a month','Spend a month off social media and notice what fills the space.',null,null,null,null,null,null),
('give-a-talk-to-a-big-audience','personal_growth','Give a talk to a big audience','Beat the nerves and speak on stage in front of hundreds of people.',null,null,null,null,null,null),
('live-abroad-for-a-year','personal_growth','Live abroad for a year','Move to a new country and build a life there for a year.',null,null,null,null,null,null),
('take-a-solo-wilderness-trip','personal_growth','Take a solo wilderness trip','Spend a few days alone in nature with only what you can carry.',null,null,null,null,null,null),
('travel-solo-for-the-first-time','personal_growth','Travel solo for the first time','Book the ticket, go on your own and meet people along the way.',null,null,null,null,null,null),
('start-your-own-business','personal_growth','Start your own business','Turn an idea into something people pay for.',null,null,null,null,null,null),
('get-in-the-best-shape-of-your-life','personal_growth','Get in the best shape of your life','Build habits that make you stronger, fitter and healthier than ever.',null,null,null,null,null,null),
('quit-a-bad-habit-for-good','personal_growth','Quit a bad habit for good','Pick the habit that holds you back and leave it behind.',null,null,null,null,null,null),
('stay-at-a-monastery-in-bhutan','personal_growth','Stay at a monastery in Bhutan','Spend time with monks in the Himalayan kingdom that measures Gross National Happiness.','asia','BT','Paro',27.4305,89.4170,'{3,4,5,9,10,11}'),
('keep-a-journal-for-a-year','personal_growth','Keep a journal for a year','Write every day for a year, then read it all back.',null,null,null,null,null,null),
('take-a-daily-cold-plunge','personal_growth','Take a cold plunge every day for a month','Build resilience one icy morning at a time.',null,null,null,null,null,null),
('visit-your-family-roots','personal_growth','Visit the place your family comes from','Travel to your ancestors'' hometown and hear the stories there.',null,null,null,null,null,null),
('try-a-finnish-sauna','personal_growth','Try a traditional Finnish sauna','Sweat in a smoke sauna, then jump into a frozen lake.','europe','FI','Helsinki',60.1699,24.9384,null),

-- Culture
('see-an-opera-at-la-scala','culture','See an opera at La Scala','Dress up for a night at Milan''s legendary opera house.','europe','IT','Milan',45.4674,9.1897,null),
('celebrate-diwali-in-india','culture','Celebrate Diwali in India','Light lamps, share sweets and watch fireworks during the festival of lights.','asia','IN','Jaipur',26.9124,75.7873,'{10,11}'),
('celebrate-holi-in-india','culture','Celebrate Holi in India','Throw coloured powder and dance in the streets to welcome spring.','asia','IN','Vrindavan',27.5650,77.6593,'{3}'),
('go-to-oktoberfest','culture','Go to Oktoberfest','Raise a stein in a Munich beer tent with thousands of new friends.','europe','DE','Munich',48.1351,11.5820,'{9,10}'),
('experience-dia-de-muertos','culture','Experience Día de Muertos in Mexico','Join candlelit vigils, marigold altars and parades honouring the dead.','north_america','MX','Oaxaca',17.0732,-96.7266,'{11}'),
('go-to-the-edinburgh-fringe','culture','Go to the Edinburgh Fringe','See comedy, theatre and the weird and wonderful at the world''s biggest arts festival.','europe','GB','Edinburgh',55.9533,-3.1883,'{8}'),
('attend-the-venice-carnival','culture','Attend the Venice Carnival','Wear a mask and cape and join the parades along the canals.','europe','IT','Venice',45.4408,12.3155,'{2}'),
('watch-the-naadam-festival','culture','Watch the Naadam festival in Mongolia','See wrestling, horse racing and archery at Mongolia''s great summer festival.','asia','MN','Ulaanbaatar',47.8864,106.9057,'{7}'),
('release-a-lantern-at-yi-peng','culture','Release a lantern at Yi Peng','Watch thousands of lanterns rise into the Chiang Mai night sky.','asia','TH','Chiang Mai',18.7883,98.9853,'{11}'),
('see-a-kabuki-show-in-tokyo','culture','See a Kabuki show in Tokyo','Watch Japan''s dramatic classical theatre at the Kabukiza.','asia','JP','Ginza, Tokyo',35.6695,139.7672,null),
('experience-chale-wote-in-accra','culture','Experience Chale Wote in Accra','Join the street art, music and performance festival in Jamestown.','africa','GH','Jamestown, Accra',5.5333,-0.2167,'{8}'),
('celebrate-felabration-in-lagos','culture','Celebrate Felabration in Lagos','Dance to Afrobeat at the week-long festival honouring Fela Kuti.','africa','NG','Lagos',6.5244,3.3792,'{10}'),
('visit-the-louvre','culture','Visit the Louvre','See the Mona Lisa, the Winged Victory and thousands more works of art.','europe','FR','Paris',48.8606,2.3376,null),
('go-to-burning-man','culture','Go to Burning Man','Join a temporary city of art and radical self-expression in the Nevada desert.','north_america','US','Black Rock Desert',40.7864,-119.2065,'{8,9}'),

-- Sport
('watch-a-world-cup-match','sport','Watch a World Cup match live','Be in the stadium for a FIFA World Cup game.',null,null,null,null,null,null),
('run-the-new-york-city-marathon','sport','Run the New York City Marathon','Run through all five boroughs cheered on by a million people.','north_america','US','New York City',40.7128,-74.0060,'{11}'),
('watch-wimbledon','sport','Watch Wimbledon','Eat strawberries and cream on Centre Court.','europe','GB','Wimbledon, London',51.4339,-0.2140,'{6,7}'),
('complete-a-triathlon','sport','Complete a triathlon','Swim, bike and run your way to a triathlon finish line.',null,null,null,null,null,null),
('cycle-across-a-country','sport','Cycle across a country','Ride from one border to the other on your own two wheels.',null,null,null,null,null,null),
('play-golf-at-st-andrews','sport','Play golf at St Andrews','Tee off on the Old Course, the home of golf.','europe','GB','St Andrews',56.3430,-2.8031,'{5,6,7,8,9}'),
('watch-the-tour-de-france','sport','Watch the Tour de France live','Cheer from the roadside as the peloton flies past.','europe','FR','Paris',48.8738,2.2950,'{7}'),
('run-the-comrades-marathon','sport','Run the Comrades Marathon','Take on the world''s oldest ultramarathon, about 90 km between Durban and Pietermaritzburg.','africa','ZA','KwaZulu-Natal',-29.6,30.38,'{6}'),

-- Social
('throw-a-dinner-party-for-20','social','Throw a dinner party for 20','Cook a feast and bring friends and strangers around one long table.',null,null,null,null,null,null),
('take-a-trip-with-your-best-friends','social','Take a trip with your best friends','Finally take that group trip you keep talking about.',null,null,null,null,null,null),
('sing-karaoke-in-tokyo','social','Sing karaoke in Tokyo','Rent a private karaoke room in Shibuya and sing until dawn.','asia','JP','Shibuya, Tokyo',35.6595,139.7005,null),
('make-a-friend-on-every-continent','social','Make a friend on every continent','Build real friendships with people all over the world.',null,null,null,null,null,null);

-- Upsert goals; the original 20 keep their featured_rank.
insert into public.goals (slug, category_slug, status, region, place_name, place_country, place_location, best_months)
select s.slug, s.category, 'active', s.region, s.place, s.country,
       case when s.lat is not null
            then extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326)::extensions.geography end,
       s.months
from goal_seed s
on conflict (slug) do update set
  category_slug  = excluded.category_slug,
  region         = excluded.region,
  place_name     = excluded.place_name,
  place_country  = excluded.place_country,
  place_location = excluded.place_location,
  best_months    = excluded.best_months;

insert into public.goal_translations (goal_id, locale, title, description)
select g.id, 'en', s.title, s.description
from goal_seed s join public.goals g on g.slug = s.slug
on conflict (goal_id, locale) do update set title = excluded.title, description = excluded.description;

-- Titles are aliases too.
insert into public.goal_aliases (goal_id, locale, alias)
select g.id, 'en', s.title
from goal_seed s join public.goals g on g.slug = s.slug
on conflict on constraint goal_aliases_goal_id_normalized_key do nothing;

-- Other phrasings and languages, so matching works across them.
insert into public.goal_aliases (goal_id, locale, alias)
select g.id, a.locale, a.alias
from (values
  ('walk-through-the-siq-to-petra', 'en', 'Visit Petra'),
  ('walk-through-the-siq-to-petra', 'es', 'Visitar Petra'),
  ('see-the-taj-mahal-at-sunrise', 'en', 'Visit the Taj Mahal'),
  ('see-the-taj-mahal-at-sunrise', 'fr', 'Voir le Taj Mahal'),
  ('explore-the-temples-of-angkor', 'en', 'Visit Angkor Wat'),
  ('walk-the-great-wall-of-china', 'es', 'Caminar por la Gran Muralla China'),
  ('walk-the-great-wall-of-china', 'pt', 'Andar na Muralha da China'),
  ('see-the-pyramids-of-giza', 'en', 'See the pyramids in Egypt'),
  ('see-the-pyramids-of-giza', 'fr', 'Voir les pyramides d''Égypte'),
  ('see-the-pyramids-of-giza', 'ar', 'زيارة أهرامات الجيزة'),
  ('drive-icelands-ring-road', 'en', 'Road trip around Iceland'),
  ('explore-the-galapagos-islands', 'es', 'Visitar las Islas Galápagos'),
  ('see-victoria-falls', 'pt', 'Ver as Cataratas Vitória'),
  ('go-bungee-jumping', 'es', 'Hacer puenting'),
  ('go-bungee-jumping', 'fr', 'Faire du saut à l''élastique'),
  ('walk-the-camino-de-santiago', 'es', 'Hacer el Camino de Santiago'),
  ('walk-the-camino-de-santiago', 'pt', 'Fazer o Caminho de Santiago'),
  ('learn-to-scuba-dive', 'en', 'Get my scuba certification'),
  ('learn-to-scuba-dive', 'fr', 'Apprendre la plongée sous-marine'),
  ('see-a-total-solar-eclipse', 'es', 'Ver un eclipse total de sol'),
  ('go-whale-watching', 'en', 'See a whale'),
  ('go-whale-watching', 'pt', 'Ver baleias'),
  ('learn-to-code', 'en', 'Learn programming'),
  ('learn-to-code', 'es', 'Aprender a programar'),
  ('learn-to-swim', 'fr', 'Apprendre à nager'),
  ('write-a-book', 'en', 'Write a novel'),
  ('write-a-book', 'es', 'Escribir un libro'),
  ('write-a-book', 'fr', 'Écrire un livre'),
  ('learn-to-play-the-piano', 'es', 'Aprender a tocar el piano'),
  ('eat-pizza-in-naples', 'it', 'Mangiare la pizza a Napoli'),
  ('learn-to-cook-jollof-in-accra', 'en', 'Cook Ghanaian jollof'),
  ('plant-100-trees', 'es', 'Plantar cien árboles'),
  ('read-100-books', 'en', 'Read a hundred books'),
  ('read-100-books', 'pt', 'Ler cem livros'),
  ('start-your-own-business', 'en', 'Start a company'),
  ('start-your-own-business', 'es', 'Emprender mi propio negocio'),
  ('travel-solo-for-the-first-time', 'en', 'Go on a solo trip'),
  ('go-to-oktoberfest', 'de', 'Aufs Oktoberfest gehen'),
  ('celebrate-holi-in-india', 'hi', 'भारत में होली मनाना'),
  ('experience-dia-de-muertos', 'es', 'Vivir el Día de Muertos'),
  ('visit-the-louvre', 'fr', 'Visiter le Louvre'),
  ('complete-a-triathlon', 'en', 'Do a triathlon'),
  ('watch-a-world-cup-match', 'pt', 'Assistir a um jogo da Copa do Mundo'),
  ('sing-karaoke-in-tokyo', 'ja', '東京でカラオケ')
) as a (slug, locale, alias)
join public.goals g on g.slug = a.slug
on conflict on constraint goal_aliases_goal_id_normalized_key do nothing;
