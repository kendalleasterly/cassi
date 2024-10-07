Options trading is a **complex** and **risky activity**, with many pitfalls that end up causing around *90% of participants to end up on the loosing side.* After spending a summer learning everything I could about options trading with spreads, I implemented my knowledge of options and statistics into a software that suggests the best possible strategies in any given situation for a particular stock. While the software is still in beta phase, over the last couple of months it has proven to be quite successful.

## Architecture

### Backend
- Completely written in Typescript
- Uses multi-threading to take advantage of all n CPU cores on the machine (I have 10, so this provided an incredible speed boost)
- Takes in all of the strike prices on the option chain, along with each bid and ask for each put and call. Every reasonable combination is then evaluated using the following method:
- Uses two log-normal probability distributions:
	- A volatility distribution to weigh the probability of a range of possible volatilities over the life of the option
	- For each range of volatilities, the midpoint is passed as the volatility into the Black-Scholes model. I use this model to find the expected value of the given combination.
- Once the expected value of each combination is found, all of the combinations are then sorted and we use the top 5

### Notion (Frontend)
- I've set up a Notion database to eliminate the need to create my own frontend.
- Once the software calculates the top 5 positions, their expected values, breakevens, and execution price are populated into the notion database.
- I manually execute the order, and enter in the price I executed the strategy for. Having an execution price filters that strategy into a separate "Current Positions" table. The software can monitor current positions and update the expected values, *but I have yet to deploy to a cloud scheduler function to do this automatically*

## What I learned
- How easy it is to build upon type-safe code in a language such as Typescript. Everything just fits together so cleanly like a puzzle.
- I've polished my problem solving process when it comes to larger, multi-part projects such as these. 
    - When I'm implementing a feature, I found it really helps to outline step-by-step what I intend to do in a checklist format.
    - I learned how important it is to take a scientific approach when solving bugs, documenting my observations while narrowing down the cause of a problem.
    - Using a [Kanban format](https://assets.asana.biz/transform/4afbad21-f79b-4beb-86d1-6c12952d414f/inline-boards-work-requests-2x?io=transform:fill,width:2560&format=webp) helped me visually manage what I was working on very effectively.