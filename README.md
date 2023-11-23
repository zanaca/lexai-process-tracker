# Browser flight price checker

You need to have at least one chrome docker container running: `make run run-dev-browser`. I will start the `browser-flight-price-tracker1.hud:$PORT_CHROME`
If you would like to start more than 1 browser, you can run `make run-dev-browser name_suffix=1` where `1` can be any number. It will be applyed to the container name.


You technically could run `BROWSER_URL=http://browser-flight-price-tracker1.hud:31001 ./src/flightProviders/itaMatrix.js '{"origin":"SDU", "destination":"MIA", "dateDeparture":"2023-05-23", "dateReturn":"2023-06-06"}'`  to run from the hostmachine to the remote browser  instance. It will not work as desined, because will not rely on data created by the cron, but the data  informed.


## How to use it

You must inform at least one itinerary on the main webpage. After it, the worker inside de browser will start to fetch prices.
It is supposed to have the cron running at least twice a day to fetch new prices.


## API

- `/api/itinerary`: List all available itineraries
- `/api/itinerary/:id`: Show data from itinerary `id`



## How to "see" a running proccess

To see what is beeing done or to integrate a new source you shoud:
- Run `start_chrome_dedicated.sh` on a shell, to start an independent chrome session
- Run the following command as an example to start the scrap on the dedicated chrome session `./src/flightProviders/gol.js '{"origin":"SDU", "destination":"CGH", "dateDeparture":"2023-05-23", "dateReturn":"2023-06-06", "adults": 2}'`   (you can choose any available source you like)


## Architeture

There is an orchestrator (`make run-dev-cronjob`) which populates the queue based on the registed itineraries and monitor the queue size to increase (to infinity) or decrease (to 0) the total number of replicas of the worker (`make run-dev-browser`) which fetches one element from the queue at a time to process it. The minimum number of spawned replicas is the amount of itineraries.

The enduser can create new itineraries or see the reports at the main application (`make run-dev`)
