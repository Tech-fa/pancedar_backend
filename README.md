## Running the app

Before running the application, ensure you have the following prerequisites:

1. **Node.js** and **npm** installed on your machine.
2. **MySQL** and **Redis** services running. You can either run them natively or use Docker by executing `docker-compose up -d` in the project directory.

First, install the dependencies:

```bash
$ npm install
```

Copy the template_env file to .env and fill in the required information.

```bash
$ cp template_env .env
```

Additionally, always run the following command before starting the development server:

```bash
$ npm run migration:run
```

Then, you can start the application:

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

