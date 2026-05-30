# User Testing

##### 27-05-26

With a clean slate (post-nuke), we will test all functionality looking for problems, bugs or ways to improve the current userflow.

###### Observation

On `/sites` When there are no sites configured, there is only a very basic message:
`No sites yet. Click “Add New Site” to get started.`
This can be improved, perhaps a graphic with a description on how to get started, maybe even have a 'wizard' at some point walking new users through the process of configuring a new site, adding some groups and then writing an article.

###### Flow: Add New Site

On `/sites` when the user clicks the `Add New Site` button, we are presented with A modal.

- [x] The background has a gradient which looks bad
- [x] The URL input seems to accept any input string, for instance I tested it with a string with a space, which should be invalid. Obviously it should validate to a domain url "something.thing"
- [ ] When the user fills out the form and clicks 'SUBMIT' button, there is a delay, this should be improved with some sort of progress indicator.

###### General: /sites page

The `/sites` page is rudimentary as we did not provide a great deal of information to claude (who generated it) as to what the purpose of this page will serve beyond listing the sites that are owned by the user.

Currently all that is shown is a Bar-shaped div with the Name of the site, the URL and two buttons **MANAGE** and **DELETE**.

Rather than the bar-shaped div, I want each site to be represented by a tile that shows more information, such as:

- [x] title _(human readable name of site - this is already provisioned in data)_
- [x] description _(... of site, content or purpose - NOT YET provisioned)_
- [x] splashImageUrl _(NOT YET provisioned)_
- [x] logoImageUrl _(NOT YET provisioned)_
- [x] url _(domain name - already provisioned)_
- [x] urlPrefix _(path prefix - already provisioned)_

The last 2 items can be used to compose what the parent path to the articles will be. Eg url: `www.big-site.com` and urlPrefix: `weblog` will produce the composed url `www.big-site.com/weblog`

Note: some of this data is poorly named: `url` should perhaps be `domainName` and `urlPrefix` might be better called `articlesPath` or something to that effect.

PROPOSED EXPANSION:
Alongside **MANAGE** and **DELETE**, I think we need another button: **CONFIGURE**.
This will take users to a new route `site/:siteName/configure` where the user can change the title, description, splash and logo images, the url or the urlPrefix.
**MANAGE** and **DELETE** will still do what they do now, Groups and Delete Site Modal respectively.

We can do more with this later too, im sure feature creep will help us fill this out as we progress.

---

##### 28-05-26

After working on the `/sites` view and adding the SiteTile component, which works well, we will continue the testing from there. Clicking the **MANAGE** button on a site takes the user to the `/article/list` page.

###### Observations

**ADD NEW GROUP MODAL BEHAVIOUR IS SUBOPTIMAL**
On the `/sites` page the first thing we need to do is add a **GROUP** to the site. The user experience here could be improved: When the user clicks `ADD NEW GROUP` button a modal opens up with a input for the Group Title, but when the user fills out the input and clicks `PROCEED` then only the text changes to `CREATING`. Once its finished the modal remains open.
If the user manually closes the modal then refreshes the page then the group has been made but a user is not to know that. This UX should be improved with a more prominent notice that something is happening and the modal should close when its finished.

**GROUP ITEMS LOOK UGLY**
The group element looks very basic, background colour is drab, the text is unstyled and not neatly arranged.

**SAVE ORDER BEHAVIOUR**
The `SAVE ORDER` button is always active. A better UX for this would be that it is disabled and only becomes enabled once the UI is no longer the same as what the order and arrangement is on the PDS data.
Similarly, it would be best if this could be used to prevent people from navigating away from the page if they have changed the order but have not saved it.
When you click `SAVE ORDER` button the acknowledgement is just a bit of green text appearing below `Order Saved`. We can do better than that. Build that Toast component

###### ACTION ITEM LIST

- [ ] Improve the UX on `/article/list/SITENAME`, when user clicks `ADD NEW GROUP`, fills out the Group Name input and clicks `PROCEED` button, there should be user feedback, a progress spinner perhaps and once the group has been added the modal should close and the view update with the recently added group showing. **_NEEDS MORE WORK - What is the expected behaviour?_**
  - [ ] Add a more prominent activity indicator than just `PROCEED` button label momentarily changing to `CREATING`
  - [ ] Once the group has been created the modal should close and the page should update to show the new group.

- [x] Style Group Item component, it looks drab and unstyled.
  - [x] Better background colour
  - [x] Put the urlSlug into a neat wrapper 'pill' and center it inline
  - [x] Use the Trash icon instead of DELETE text for consistency
  - [x] Add Tooltips where they'll be useful.

- [ ] SAVE ORDER button behaviour
  - [ ] disabled until the order is not the same as that on the PDS
  - [ ] warn user if they try to navigate away from the page if they have changed the order but not saved it
  - [ ] Improve the `Order Saved` notification, build a Toast component.

###### New Components List

- [x] Bottom Buttons Portal - the ability to put buttons in the `<footer>` of the main layout
- [x] Toast Context Provider and Components
- [x] ReactRouter Navigation-Based Loading Spinner
- [ ] Universal / Site Wide Loading Spinner (or equivelent) (Context)
