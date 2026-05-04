# Notch code interview

## Background
Welcome to Notch! We're excited to meet you!
The goal for this coding exercise is for us to see your basic coding skills:
- Understanding requirements
- Implementing code that works
- Code maintainability
- Separation of architectural layers

Also, it's a starting point for technical discussions. Things like:
- Why did you choose library X?
- How would you implement Y?
- What would you do if you had more time?

The most important thing is to finish **in time** with **working code**. Maintainability and cleanliness come afterwards.

The exercise instructions are deliberately partially detailed. For example, we don't always define what is considered a Bad Request. When information is missing, use your common sense and make your best guess. You may also treat your interviewer as your product manager and consult with them.

You may implement this exercise in any language, framework or library of your liking. A skeleton project is provided for you, but you may choose not to use it.

Good luck!

#### Skeleton project instructions
- Minimum node version is 18
- This project uses npm and not yarn/pnpm for simplicity's sake
- Start the backend with `cd backend; npm i; npm start`
- Start the frontend with `cd frontend; npm i; npm run dev`

## General instructions
You will create a mini "chat" application where you can talk to an AI bot.
**Please provide instructions for how to run your project from your source code** (e.g `npm install && tsc && PORT=3000 node dist`).

This exercise consists of parts. Make sure you're completely done with each part before moving on to the next. As a tip, you're advised to make a different commit/branch for every part to make sure you have a stable, working version for each part.

Make sure you don't get stuck on understanding the instructions! We want to see how you code and think. If we happen to use a term you don't recognize, or if the instructions are not clear - just ask. We want to help you be at your best.

## Exercise
### Part A - Implementing an answer from the server
From the skeleton project, make it so that every time a user submits a message, the server responds with an answer from Open AI's Chat Completion feature:
https://platform.openai.com/docs/guides/text-generation/chat-completions-api

An API key should be provided to you by the interviewer.
Use whichever API endpoints and parameters you see fit.

Requirements:
- Make sure the bot always signs each message with a different emoji

Tip: OpenAI's API receives as an input an array of messages. Each message has one of the following roles: user, assistant, system. 
Usually, the first message is a "system prompt" and the rest of the messages are the current conversation.
Use the "system prompt" to give the bot relevant instructions and to change the bot's behavior.

### Part B - Implementing extraction of unstructured data
For this part of the question, you will use Open AI's "function calling" feature to extract the user's sentiment from the conversation.
https://platform.openai.com/docs/guides/function-calling
When the server receives a user's message, use Open AI's "function calling" interface to rate the user's current sentiment from 0-100 where 0 is very negative and 100 is very positive.
Your goal is to print the user's sentiment as a log to the console (in a real application, you would probably save this to a database).

Tip:
A call to OpenAI can either return a response or use a "function call". This means you would need 2 parallel requests to OpenAI in order to implement both part A and B.

### If time left: Part C - Implement the concept of "conversations"
For this part of the question, you will implement a new feature: "conversations".
Requirements:
- As a user, in the frontend, I can see a lists of "ongoing conversations".
- I am able to create a new "conversation" or enter an existing one.
- Entering an existing conversation should lead to the page that you've been working on in part A.
- When in an existing conversation, you should be able to go back to the list of "ongoing conversations".
- Refreshing the browser should not lead to loss of data
- Refreshing the server may lead to loss of data (no need to save data to a database)