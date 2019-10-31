## Required

- API Key from Pelion Device Management: `APIKEY`
- API Host of Pelion Device Management if not default: `APIHOST`

## Launch from Github

Goto Github app: [Workshop App on Github](https://github.com/bertfroeba/workshop-web-app)

Click Deploy to Heroku button

Create a free Heroku account

Need to provide:

- First name
- Last name
- Email address
- Role
- Country
- Development language

Create free account

Confirm your email

Set your password after confirmation

Welcome -> Click here to proceed

Continues create app flow

- Enter name for your app: `APP`

Starts build process and deploys app

## Set Config Vars

Manage App -> Goto Settings -> Config Vars

| Key                    | Value                        |
| ---------------------- | ---------------------------- |
| MBED_CLOUD_SDK_API_KEY | `APIKEY`                     |
| HOSTNAME               | https://`APP`.herokuapp.com/ |

If `APIHOST` is not default production account:

| Key                 | Value     |
| ------------------- | --------- |
| MBED_CLOUD_SDK_HOST | `APIHOST` |

## Provision a Database

Resources -> Add-ons

Search for `postgres` and attach a free hobby account

## Check for issues

More -> View logs

## Check deployment

Click `Open App`
