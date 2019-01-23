const Discord = require('discord.js')
const dbOps = require('../util/dbOps.js')
const filters = require('./util/filters.js')
const config = require('../config.js')
const log = require('../util/logger.js')
const MenuUtils = require('../structs/MenuUtils.js')
const FeedSelector = require('../structs/FeedSelector.js')
const VALID_OPTIONS = ['1', '2', '3', '4']

async function printSubscriptions (message, rssList) {
  const guild = message.guild
  const subList = {}
  const msg = new Discord.RichEmbed()
    .setColor(config.bot.menuColor)
    .setDescription(`\nBelow are the feed titles with any roles and users subscribed to that feed under it. Each role is then categorized as either a global or filtered subscription.\u200b\n\u200b\n`)
    .setAuthor('Subscribed Roles List')

  for (const rssName in rssList) {
    const source = rssList[rssName]
    const subscriptionTypes = [ source.globalSubscriptions, source.filteredSubscriptions ]
    for (let i = 0; i < subscriptionTypes.length; ++i) {
      const reference = subscriptionTypes[i] // Both references are arrays of objects
      if (!reference) continue
      for (const subscriber of reference) {
        const id = subscriber.id
        const type = subscriber.type
        if (!subList[source.title]) subList[source.title] = {}
        const embedReferenceTitle = i === 0 ? 'globalSubs' : 'filteredSubs'
        if (!subList[source.title][embedReferenceTitle]) subList[source.title][embedReferenceTitle] = []
        if (type === 'user') {
          const resolvedUser = guild.members.get(id)
          const toInsert = resolvedUser ? `${resolvedUser.user.username}#${resolvedUser.user.discriminator}` : ''
          if (resolvedUser && !subList[source.title][embedReferenceTitle].includes(toInsert)) subList[source.title][embedReferenceTitle].push(toInsert)
        } else if (type === 'role') {
          const resolvedRole = guild.roles.get(id)
          const toInsert = resolvedRole ? resolvedRole.name : ''
          if (resolvedRole && !subList[source.title][embedReferenceTitle].includes(toInsert)) subList[source.title][embedReferenceTitle].push(toInsert)
        }
      }
    }
  }

  if (Object.keys(subList).length === 0) await message.channel.send(`There are no subscriptions for any feeds.`)
  else {
    for (const feed in subList) {
      let list = ''

      let globalSubList = '**Global Subscriptions:**\n'
      for (let globalSubber in subList[feed].globalSubs) {
        globalSubList += `${subList[feed].globalSubs[globalSubber]}\n`
      }
      if (globalSubList !== '**Global Subscriptions:**\n') list += globalSubList

      let filteredSubList = '\n**Filtered Subscriptions:**\n'
      for (let filteredSubber in subList[feed].filteredSubs) {
        filteredSubList += `${subList[feed].filteredSubs[filteredSubber]}\n`
      }
      if (filteredSubList !== '\n**Filtered Subscriptions:**\n') list += filteredSubList
      if (list) msg.addField(feed, list, true)
    }
    await message.channel.send({ embed: msg })
  }
}

// Remove all subscriptions for a role
async function deleteSubscription (message, guildRss, role, user) {
  const roleID = role ? role.id : undefined
  const userID = user ? user.id : undefined
  const rssList = guildRss.sources
  let found = false

  for (const rssName in rssList) {
    const source = rssList[rssName]
    const subscriptionTypes = [ source.globalSubscriptions, source.filteredSubscriptions ]
    for (let i = 0; i < subscriptionTypes.length; ++i) {
      const reference = subscriptionTypes[i] // Both references are arrays of objects
      if (!reference) continue
      for (let i = reference.length - 1; i >= 0; --i) {
        const subscriber = reference[i]
        const id = subscriber.id
        if (id === roleID || id === userID) {
          reference.splice(i, 1)
          found = true
        }
      }
      if (Object.keys(reference).length === 0) delete (i === 0 ? source.globalSubscriptions : source.filteredSubscriptions) // Deleting reference does not affect the original object
    }
  }

  if (!found) await message.channel.send(`This ${role ? 'role' : 'user'} has no subscriptions to remove.`)
  else {
    log.command.info(`Deleting all subscriptions`, message.guild, user || role)
    await dbOps.guildRss.update(guildRss)
    await message.channel.send(`All subscriptions successfully deleted for ${role ? `role ${role.name}\`` : `user \`${user.username}\``}. After completely setting up, it is recommended that you use ${config.bot.prefix}rssbackup to have a personal backup of your settings.`)
  }
}

// Add global subscriptions, called from openSubMenu
async function addGlobalSub (message, guildRss, rssName, role, user) {
  const source = guildRss.sources[rssName]
  // remove any filtered subscriptions when adding global subscription, and delete parents if empty
  const { filteredSubscriptions } = source
  if (filteredSubscriptions) {
    for (let i = filteredSubscriptions.length - 1; i >= 0; --i) {
      if (filteredSubscriptions[i].id === (role ? role.id : user.id)) filteredSubscriptions.splice(i, 1)
    }
    if (filteredSubscriptions.length === 0) delete source.filteredSubscriptions
  }

  if (!source.globalSubscriptions) source.globalSubscriptions = []
  const { globalSubscriptions } = source
  const id = role ? role.id : user.id
  const name = role ? role.name : user.username
  const type = role ? 'Role' : 'User'
  for (const subscriber of globalSubscriptions) {
    if (id === subscriber.id) return message.channel.send(`Unable to add global subscription. ${type} \`${name}\` is already subscribed to this feed.`)
  }
  source.globalSubscriptions.push({
    id,
    name,
    type: type.toLowerCase()
  })

  await dbOps.guildRss.update(guildRss)
  log.command.info(`Added global subscription to feed ${source.link}`, message.guild, role || user)
  await message.channel.send(`Global subscription successfully added for \`${name}\` to feed <${source.link}>. After completely setting up, it is recommended that you use ${config.bot.prefix}rssbackup to have a personal backup of your settings.`)
}

// Remove global subscriptions, called from openSubMenu
async function removeGlobalSub (message, guildRss, rssName, role, user) {
  const source = guildRss.sources[rssName]
  const wantedId = role ? role.id : user.id
  let found = false
  if (!source.globalSubscriptions) return message.channel.send(`This role is not globally subscribed to the feed <${source.link}>.`)
  const { globalSubscriptions } = source
  for (let i = globalSubscriptions.length - 1; i >= 0; --i) {
    const subscriber = globalSubscriptions[i]
    if (subscriber.id !== wantedId) continue
    globalSubscriptions.splice(i, 1)
    found = true
  }
  if (!found) return message.channel.send(`The user \`${user.username} does not have a global subscription to this feed.`)
  if (globalSubscriptions.length === 0) delete source.globalSubscriptions

  await dbOps.guildRss.update(guildRss)
  log.command.info(`Removed global subscription for feed ${source.link}`, message.guild, role || user)
  await message.channel.send(`Successfully removed the global subscription of the ${role ? `role \`${role.name}\`` : `user \`${user.username}#${user.discriminator}\``} from the feed <${source.link}>. After completely setting up, it is recommended that you use ${config.bot.prefix}rssbackup to have a personal backup of your settings.`)
}

async function filteredSubMenuFn (m, data) {
  const { guildRss, rssName, role, user } = data
  const source = guildRss.sources[rssName]
  const input = m.content // 1 = add, 2 = remove
  if (input === '1') {
    return { ...data,
      next: {
        series: filters.add(m, guildRss, rssName, role, user)
      } }
  } else if (input === '2') {
    if (!source.filteredSubscriptions || source.filteredSubscriptions.length === 0) return m.channel.send(`There are no ${role ? 'role' : 'user'} filtered subscriptions to remove from the feed <${source.link}>.`)
    return { ...data,
      next: {
        series: filters.remove(m, guildRss, rssName, role, user)
      } }
  } else throw new SyntaxError('That is not a valid option. Try again, or type `exit` to cancel.')
}

async function globalSubMenuFn (m, data) {
  const { guildRss, rssName, role, user } = data
  const source = guildRss.sources[rssName]
  const input = m.content // 1 = add, 2 = remove
  if (input === '1') {
    await addGlobalSub(m, guildRss, rssName, role, user)
    return data
  } else if (input === '2') {
    if (!source.globalSubscriptions || source.globalSubscriptions.length === 0) return m.channel.send(`There are no global user subscriptions to remove from the feed <${source.link}>.`)
    await removeGlobalSub(m, guildRss, rssName, role, user)
    return data
  } else throw new SyntaxError('That is not a valid option. Try again, or type `exit` to cancel.')
}

async function getUserOrRoleFn (m, data) {
  const input = m.content
  const mention = m.mentions.roles.first()
  if (mention) return { ...data, role: mention }
  const role = m.guild.roles.find(r => r.name === input)
  const member = m.guild.members.get(input) || m.mentions.members.first()
  if (input === '@everyone') throw new SyntaxError('That is not a valid role. Try again, or type `exit` to cancel.')
  else if (m.guild.roles.filter(r => r.name === input).length > 1) throw new SyntaxError('There are multiple roles with that name. Mention the role, type another role, or type `exit` to cancel.')
  else if (!role && !member) throw new SyntaxError('That is not a valid role or user. Try again, or type `exit` to cancel.')
  return { ...data, role, user: member ? member.user : undefined }
}

async function feedSelectorFn (m, data) {
  const { guildRss, rssName, role, user } = data
  const source = guildRss.sources[rssName]
  return { ...data,
    next:
    { embed: {
      description: `**Selected ${role ? 'Role' : 'User'}**: ${role ? role.name : user.username}\n**Feed Title:** ${source.title}\n**Feed Link:** ${source.link}\n\nSelect an option by typing its number, or type **exit** to cancel.\u200b\n\u200b\n` } }
  }
}

async function selectOptionFn (m, data) {
  const optionSelected = m.content
  if (!VALID_OPTIONS.includes(optionSelected)) throw new SyntaxError('That is not a valid option. Try again, or type `exit` to cancel.')
  const nextData = { ...data, optionSelected: optionSelected }

  if (optionSelected === '4') return nextData
  else if (optionSelected === '3' || optionSelected === '2' || optionSelected === '1') { // Options 1, 2, and 3 requires a role or user to be acquired first
    const getUserOrRole = new MenuUtils.Menu(m, getUserOrRoleFn, { text: 'Enter a valid case-sensitive role name, role/user mention or user ID. The `@everyone` role cannot be used.' })
    if (optionSelected === '3') {
      nextData.next = { menu: getUserOrRole }
      return nextData
    }
    const feedSelector = new FeedSelector(m, feedSelectorFn, { command: data.command }, data.guildRss)

    if (optionSelected === '2') { // Filtered Sub Menu
      const filteredSubMenu = new MenuUtils.Menu(m, filteredSubMenuFn)
        .setAuthor(`Subscription Customization - Add/Remove Filtered Subscription`)
        .addOption(`Add filter to filtered subscription`, `Add a filtered subscription so that this role/user will get mentioned everytime an article from a feed passes its filter tests.`)
        .addOption(`Remove filter from filtered subscription`, `Remove a word/phrase from this role/user's subscription to a feed.`)
      nextData.next = { menu: [getUserOrRole, feedSelector, filteredSubMenu] }
    } else { // Global Sub Menu
      const globalSubMenu = new MenuUtils.Menu(m, globalSubMenuFn)
        .setAuthor(`Subscription Customization - Add/Remove Global Subscription`)
        .addOption(`Add global subscription`, `Have the role/user get mentioned every time a new article is posted from this feed.`)
        .addOption(`Remove global subscription`, `Remove the role/user's subscription to this feed.`)
      nextData.next = { menu: [getUserOrRole, feedSelector, globalSubMenu] }
    }

    return nextData
  }
}

module.exports = async (bot, message, command) => {
  try {
    const guildRss = await dbOps.guildRss.get(message.guild.id)
    if (!guildRss || !guildRss.sources || Object.keys(guildRss.sources).length === 0) return await message.channel.send('Cannot add role customizations without any active feeds.')

    const rssList = guildRss.sources
    const selectOption = new MenuUtils.Menu(message, selectOptionFn)
      .setDescription(`\n**Current Channel:** #${message.channel.name}\n\nAdding a subscription for a user or role will automatically add their mentions in the \`{subscribers}\` placeholder. If the subscriber is a role, then the role will be added to the list of eligible roles for role mention toggling, and also for the commands ${guildRss.prefix || config.bot.prefix}subme/unsubme.\n\nSelect an option by typing its number, or type **exit** to cancel.\u200b\n\u200b\n`)
      .setAuthor('Subscription Options')
      .addOption(`Add/Remove Global Subscriptions for a Role or User`, `Enable mentions for a role/user for all delivered articles of this feed.\n*Using global subscriptions will remove filtered subscriptions if enabled for that role/user.*`)
      .addOption(`Add/Remove Filtered Subscriptions for a Role or User`, `Create role/user-specific filters where only selected articles will mention a role/user.\n*Using filtered subscriptions will remove global subscriptions if enabled for that role/user.*`)
      .addOption(`Remove All Subscriptions for a Role or User`, `Remove all subscriptions for a role/user.`)
      .addOption(`List Roles with Subscriptions`, `List all roles with all types of subscriptions.`)

    const data = await new MenuUtils.MenuSeries(message, [selectOption], { command: command, guildRss }).start()
    if (!data) return
    const { optionSelected, role, user } = data
    if (optionSelected === '4') return await printSubscriptions(message, rssList)
    if (optionSelected === '3') return await deleteSubscription(message, guildRss, role, user)
    // 2 and 1 are handled within the Menu functions due to their complexity
  } catch (err) {
    log.command.warning(`rssroles`, message.guild, err)
    if (err.code !== 50013) message.channel.send(err.message).catch(err => log.command.warning('rssroles 1', message.guild, err))
  }
}
