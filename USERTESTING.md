# User Testing

##### 27-05-26

With a clean slate (post-nuke), we will test all functionality looking for problems, bugs or ways to improve the current userflow.

###### Observation

On `/sites` When there are no sites configured, there is only a very basic message:
`No sites yet. Click “Add New Site” to get started.`
This can be improved, perhaps a graphic with a description on how to get started, maybe even have a 'wizard' at some point walking new users through the process of configuring a new site, adding some groups and then writing an article.

###### Flow: Add New Site

On `/sites` when the user clicks the `Add New Site` button, we are presented with A modal.

- [ ] The background has a gradient which looks bad
- [ ] The URL input seems to accept any input string, for instance I tested it with a string with a space, which should be invalid. Obviously it should validate to a domain url "something.thing"
- [ ] When the user fills out the form and clicks 'SUBMIT' button, there is a delay, this should be improved with some sort of progress indicator.

###### General: /sites page

The `/sites` page is rudimentary as we did not provide a great deal of information to claude (who generated it) as to what the purpose of this page will serve beyond listing the sites that are owned by the user.

Currently all that is shown is a Bar-shaped div with the Name of the site, the URL and two buttons **MANAGE** and **DELETE**.

Rather than the bar-shaped div, I want each site to be represented by a tile that shows more information, such as:

- [ ] title _(human readable name of site - this is already provisioned in data)_
- [ ] description _(..of site, content or purpose - NOT YET provisioned)_
- [ ] splashImageUrl _(NOT YET provisioned)_
- [ ] logoImageUrl _(NOT YET provisioned)_
- [ ] url _(domain name - already provisioned)_
- [ ] urlPrefix _(path prefix - already provisioned)_

The last 2 items can be used to compose what the parent path to the articles will be. Eg url: `www.big-site.com` and urlPrefix: `weblog` will produce the composed url `www.big-site.com/weblog`

Note: some of this data is poorly named: `url` should perhaps be `domainName` and `urlPrefix` might be better called `articlesPath` or something to that effect.

PROPOSED EXPANSION:
Alongside **MANAGE** and **DELETE**, I think we need another button: **CONFIGURE**.
This will take users to a new route `site/:siteName/configure` where the user can change the title, description, splash and logo images, the url or the urlPrefix.
**MANAGE** and **DELETE** will still do what they do now, Groups and Delete Site Modal respectively.

We can do more with this later too, im sure feature creep will help us fill this out as we progress.
