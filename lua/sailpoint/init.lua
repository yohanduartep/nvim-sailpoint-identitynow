local M = {}

-- SailPoint IdentityNow Plugin for Neovim
-- This module provides the core Lua interface for interacting with the SailPoint backend,
-- managing the sidebar UI, and handling user commands.

M.cache = {}
M.raw_cache = {}
M.sidebar_state = { expanded = {} }
M.sidebar_nodes = {}
M.is_active = false

local all_types = {}

-- Loads resource definitions from the TypeScript backend to ensure a single source of truth.
local function load_resource_types()
	local fallback = {
		{ id = "tenants", name = "Tenants" },
		{ id = "access-profiles", name = "Access Profiles" },
		{ id = "apps", name = "Applications" },
		{ id = "campaigns", name = "Campaigns" },
		{ id = "forms", name = "Forms" },
		{ id = "identities", name = "Identities" },
		{ id = "identity-attributes", name = "Identity Attributes" },
		{ id = "identity-profiles", name = "Identity Profiles" },
		{ id = "roles", name = "Roles" },
		{ id = "rules", name = "Rules" },
		{ id = "search-attributes", name = "Search Attribute Config" },
		{ id = "service-desk", name = "Service Desk" },
		{ id = "sources", name = "Sources" },
		{ id = "transforms", name = "Transforms" },
		{ id = "workflows", name = "Workflows" },
	}

	local ok, defs = pcall(vim.fn.SailPointGetResourceDefinitions)
	if ok and type(defs) == "table" and #defs > 0 then
		local tenants_cat = nil
		local others = {}
		for _, d in ipairs(defs) do
			if d.id == "tenants" then
				tenants_cat = d
			else
				table.insert(others, d)
			end
		end
		table.sort(others, function(a, b)
			return a.name:lower() < b.name:lower()
		end)
		all_types = others
		if tenants_cat then
			table.insert(all_types, 1, tenants_cat)
		end
	else
		local tenants_cat = table.remove(fallback, 1)
		table.sort(fallback, function(a, b)
			return a.name:lower() < b.name:lower()
		end)
		all_types = fallback
		if tenants_cat then
			table.insert(all_types, 1, tenants_cat)
		end
	end
end

-- Opens a buffer for the specified resource type and ID.
-- Uses the openConfig from the backend definition to determine the correct action.
function M.open_resource(type, id)
	local res_def = nil
	for _, d in ipairs(all_types) do
		if d.id == type then
			res_def = d
			break
		end
	end

	if not res_def or not res_def.openConfig then
		print("Not implemented: " .. type)
		return
	end

	local config = res_def.openConfig
	local tenant = vim.fn.SailPointGetActiveTenant()
	local version = (tenant and tenant.version) or "v3"

	if config.type == "command" then
		vim.cmd(config.command .. " " .. id)
	elseif config.type == "raw" then
		local path = config.path:find("^/") and config.path or ("/" .. version .. "/" .. config.path)
		vim.cmd("SPIRaw " .. path .. "/" .. id)
	elseif config.type == "fallback" then
		local path = config.path:find("^/") and config.path or ("/" .. version .. "/" .. config.path)
		local fallback = config.fallbackPath:find("^/") and config.fallbackPath or ("/" .. version .. "/" .. config.fallbackPath)
		
		-- Special case for search-attributes which doesn't take an ID in the URL for config
		local target_id = id
		if type == "search-attributes" then
			target_id = "config"
		else
			path = path .. "/" .. id
			fallback = fallback .. "/" .. id
		end
		
		vim.fn.SailPointRawWithFallback(path, fallback, type, target_id)
	end
end

-- Renders the sidebar tree view in the sailpoint-sidebar buffer.
-- Uses M.raw_cache to populate the tree nodes and handles expansion states.
function M.render_sidebar()
	local bufnr = nil
	for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
		local buf = vim.api.nvim_win_get_buf(win)
		if vim.api.nvim_buf_is_valid(buf) and vim.bo[buf].filetype == "sailpoint-sidebar" then
			bufnr = buf
			break
		end
	end
	if not bufnr then
		return
	end

	vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
	local lines = {}
	M.sidebar_nodes = {}

	table.insert(lines, " SailPoint Navigator")
	table.insert(lines, " " .. string.rep("─", 25))
	table.insert(M.sidebar_nodes, { type = "header" })
	table.insert(M.sidebar_nodes, { type = "header" })

	for _, res_type in ipairs(all_types) do
		local is_expanded = M.sidebar_state.expanded[res_type.id]
		local icon = is_expanded and "▼" or "▶"
		table.insert(lines, string.format(" %s %s", icon, res_type.name))
		table.insert(M.sidebar_nodes, { type = "category", id = res_type.id })

		if is_expanded then
			local items = M.raw_cache[res_type.id]
			if items and #items > 0 then
				for _, item in ipairs(items) do
					local name = item.name or item.displayName or item.id or "Unknown"
					if res_type.id == "tenants" and item.isActive then
						name = name .. " *"
					end
					table.insert(lines, "   " .. name)
					table.insert(M.sidebar_nodes, {
						type = "item",
						id = item.id,
						resource_type = res_type.id,
						value = item,
					})
				end
			elseif items == nil then
				table.insert(lines, "   (Loading...)")
				table.insert(M.sidebar_nodes, { type = "loading" })
			else
				table.insert(lines, "   (No items)")
				table.insert(M.sidebar_nodes, { type = "empty" })
			end
		end
	end

	vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
	vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
end

-- Handles user interactions (clicks/enter) in the sidebar buffer.
-- Expands/collapses categories or opens resources.
function M.sidebar_click()
	local line = vim.api.nvim_win_get_cursor(0)[1]
	local node = M.sidebar_nodes[line]
	if not node then
		return
	end

	if node.type == "category" then
		M.sidebar_state.expanded[node.id] = not M.sidebar_state.expanded[node.id]
		if M.sidebar_state.expanded[node.id] and not M.raw_cache[node.id] then
			pcall(vim.fn.SailPointFetchItems, node.id)
		end
		M.render_sidebar()
	elseif node.type == "item" then
		if node.resource_type == "tenants" then
			vim.cmd("SPISwitchTenant " .. node.id)
			M.cache = {}
			M.raw_cache = {}
			pcall(vim.cmd, "SPIPrefetchAll")
			M.render_sidebar()
		else
			local target_win = nil
			local non_sidebar_windows = {}
			for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
				local buf = vim.api.nvim_win_get_buf(win)
				if vim.bo[buf].filetype ~= "sailpoint-sidebar" then
					table.insert(non_sidebar_windows, win)
				end
			end

			if #non_sidebar_windows > 0 then
				target_win = non_sidebar_windows[1]
				vim.api.nvim_set_current_win(target_win)
				local buf = vim.api.nvim_win_get_buf(target_win)
				local name = vim.api.nvim_buf_get_name(buf)
				local is_sailpoint_buffer = name:find("^SailPoint:/") ~= nil
				if #non_sidebar_windows > 1 or is_sailpoint_buffer then
					vim.cmd("rightbelow split")
				end
			else
				vim.cmd("rightbelow vertical split")
			end

			M.open_resource(node.resource_type, node.id)
		end
	end
end

-- Initializes the sidebar buffer with specific filetype, options, and keymaps.
function M.setup_sidebar_buffer()
	if #all_types == 0 then
		load_resource_types()
	end
	local bufnr = vim.api.nvim_get_current_buf()
	vim.bo[bufnr].filetype = "sailpoint-sidebar"
	vim.bo[bufnr].buftype = "nofile"
	vim.bo[bufnr].swapfile = false
	vim.bo[bufnr].bufhidden = "hide"

	vim.api.nvim_buf_set_keymap(bufnr, "n", "<CR>", "", {
		callback = function()
			M.sidebar_click()
		end,
		noremap = true,
		silent = true,
	})
	vim.api.nvim_buf_set_keymap(bufnr, "n", "o", "", {
		callback = function()
			M.sidebar_click()
		end,
		noremap = true,
		silent = true,
	})

	if not next(M.raw_cache) then
		pcall(vim.cmd, "SPIPrefetchAll")
	end

	M.render_sidebar()
end

local function append_lines(target, input)
	if type(input) == "string" then
		for _, line in ipairs(vim.split(input, "\n")) do
			table.insert(target, line)
		end
	elseif type(input) == "table" then
		for _, item in ipairs(input) do
			append_lines(target, item)
		end
	end
end

_G.SailPointUpdateCache = function(type, items, err)
	M.raw_cache[type] = items
	vim.schedule(function()
		M.render_sidebar()
	end)

	local lines = {}
	if err and err ~= "" then
		table.insert(lines, "Error fetching " .. type .. ":")
		table.insert(lines, string.rep("-", 20))
		append_lines(lines, err)
		table.insert(lines, "")
		table.insert(lines, "Check your connection or credentials.")
		M.cache[type] = lines
		return
	end

	table.insert(lines, "Items in " .. type .. ":")
	table.insert(lines, string.rep("-", 20))
	if items and #items > 0 then
		table.sort(items, function(a, b)
			local name_a = (a.name or a.displayName or a.id or ""):lower()
			local name_b = (b.name or b.displayName or b.id or ""):lower()
			return name_a < name_b
		end)

		for i, item in ipairs(items) do
			if i > 30 then
				table.insert(lines, "... and " .. (#items - 30) .. " more")
				break
			end
			local name = item.name or item.displayName or item.id or "Unknown"
			if type == "tenants" and item.isActive then
				name = name .. " *"
			end
			table.insert(lines, i .. ". " .. name)
		end
	else
		table.insert(lines, "(No items found)")
	end
	M.cache[type] = lines
end

local function check_dependencies()
	local missing = {}
	if vim.fn.executable("node") == 0 then
		table.insert(missing, "Node.js")
	end
	if vim.fn.executable("npm") == 0 then
		table.insert(missing, "npm")
	end
	local has_plenary, _ = pcall(require, "plenary")
	if not has_plenary then
		table.insert(missing, "plenary.nvim")
	end
	local has_telescope, _ = pcall(require, "telescope")
	if not has_telescope then
		table.insert(missing, "telescope.nvim")
	end
	return missing
end

function M.check_health()
	local health = vim.health or require("health")
	health.start("sailpoint.nvim report")
	local missing = check_dependencies()
	if #missing == 0 then
		health.ok("All dependencies are present.")
	else
		for _, item in ipairs(missing) do
			health.error(item .. " is missing.")
		end
		health.info("Please install missing dependencies.")
	end
	local plugin_dir = debug.getinfo(1).source:sub(2):match("(.*)/lua/sailpoint/init.lua")
	if plugin_dir then
		local node_modules = plugin_dir .. "/rplugin/node/sailpoint/node_modules"
		if vim.fn.isdirectory(node_modules) == 1 then
			health.ok("Node.js dependencies installed.")
		else
			health.warn("Node.js dependencies missing. Run :SPIInstall.")
		end
	end
end

-- Main setup function.
-- Configures the sidebar width, keymaps, and registers user commands.
function M.setup(opts)
	opts = opts or {}
	load_resource_types()
	local sidebar_width = opts.sidebar_width or 35
	local sidebar_keymap = opts.sidebar_keymap or "<leader>tt"

	local function setup_sidebar_controls()
		local sailpoint_win = nil
		vim.api.nvim_create_autocmd({ "FileType", "WinEnter" }, {
			group = vim.api.nvim_create_augroup("SailPointSidebar", { clear = true }),
			callback = function(ev)
				local buf = ev.buf or vim.api.nvim_get_current_buf()
				if vim.bo[buf].filetype ~= "sailpoint-sidebar" then
					return
				end
				local win = vim.fn.bufwinid(buf)
				if win == -1 then
					return
				end
				vim.api.nvim_win_set_width(win, sidebar_width)
				vim.wo[win].winfixwidth = true
			end,
		})

		if sidebar_keymap then
			vim.keymap.set("n", sidebar_keymap, function()
				if sailpoint_win and vim.api.nvim_win_is_valid(sailpoint_win) then
					vim.api.nvim_win_close(sailpoint_win, true)
					sailpoint_win = nil
					return
				end

				local saved_equalalways = vim.o.equalalways
				vim.o.equalalways = false
				vim.cmd("topleft vnew")
				sailpoint_win = vim.api.nvim_get_current_win()
				vim.api.nvim_win_set_width(sailpoint_win, sidebar_width)
				vim.wo[sailpoint_win].winfixwidth = true
				vim.o.equalalways = saved_equalalways

				vim.wo[sailpoint_win].number = false
				vim.wo[sailpoint_win].relativenumber = false
				vim.wo[sailpoint_win].signcolumn = "no"
				vim.wo[sailpoint_win].wrap = false

				vim.cmd("SetSail")
			end, { silent = true, desc = "Toggle SailPoint Sidebar" })
		end
	end

	setup_sidebar_controls()

	local preview_timer = vim.loop.new_timer()
	local pick_resource_type
	local sailpoint_telescope

	local function add_tenant_wizard()
		vim.ui.input({ prompt = "Friendly Name: " }, function(name)
			if not name or name == "" then
				return
			end
			vim.ui.input({ prompt = "Tenant ID: " }, function(id)
				if not id or id == "" then
					return
				end
				vim.ui.input({ prompt = "Client ID: " }, function(cid)
					if not cid or cid == "" then
						return
					end
					vim.ui.input({ prompt = "Secret: " }, function(sec)
						if not sec or sec == "" then
							return
						end
						vim.ui.input({ prompt = "Domain: ", default = "identitynow.com" }, function(dom)
							local domain = (not dom or dom == "") and "identitynow.com" or dom
							vim.fn.SPIAddTenant(name, id, cid, sec, domain)
							M.cache = {}
						end)
					end)
				end)
			end)
		end)
	end

	local function safe_fetch_items(type)
		local ok, result = pcall(vim.fn.SailPointFetchItems, type)
		if not ok then
			return nil, "No tenants configured."
		end
		return result, nil
	end

	local function prefetch_all_resources()
		local tenants, _ = safe_fetch_items("tenants")
		if not tenants or #tenants == 0 then
			_G.SailPointUpdateCache("tenants", nil, "There are no tenants.")
			for _, t in ipairs(all_types) do
				if t.id ~= "tenants" then
					_G.SailPointUpdateCache(t.id, nil, "No tenants configured. Use :SailPointAdd tenant")
				end
			end
			return
		end
		pcall(vim.cmd, "SPIPrefetchAll")
	end

	sailpoint_telescope = function(type, query, extra_opts)
		if M.is_active then
			return
		end
		local has_telescope, telescope = pcall(require, "telescope")
		if not has_telescope then
			return
		end

		M.is_active = true
		M.cache[type] = nil
		local items, err = safe_fetch_items(type)
		if err or not items or #items == 0 then
			M.is_active = false
			print("SailPoint: " .. (err or "Empty."))
			return false
		end

		local pickers = require("telescope.pickers")
		local finders = require("telescope.finders")
		local conf = require("telescope.config").values
		local actions = require("telescope.actions")
		local action_state = require("telescope.actions.state")
		local previewers = require("telescope.previewers")

		local picker_opts = {
			sorting_strategy = "ascending",
		}
		if extra_opts and extra_opts.fullscreen then
			picker_opts.layout_strategy = "horizontal"
			picker_opts.layout_config = {
				width = 0.99,
				height = 0.99,
				prompt_position = "top",
				preview_width = 0.6,
			}
		else
			picker_opts.layout_config = { anchor = "N", height = 0.8, width = 0.8, prompt_position = "top" }
		end

		local function on_close(prompt_bufnr)
			M.is_active = false
			if prompt_bufnr then
				actions.close(prompt_bufnr)
			end
		end

		local ok, _ = pcall(function()
			pickers
				.new(picker_opts, {
					prompt_title = "SailPoint " .. type:gsub("-", " "):gsub("^%l", string.upper),
					finder = finders.new_table({
						results = items,
						entry_maker = function(entry)
							local display = entry.name or entry.displayName or entry.id or "Unknown"
							if type == "tenants" and entry.isActive then
								display = display .. " *"
							end
							return {
								value = entry,
								display = display .. " (ID: " .. (entry.id or "N/A") .. ")",
								ordinal = display,
							}
						end,
					}),
					sorter = conf.generic_sorter({}),
					previewer = previewers.new_buffer_previewer({
						define_preview = function(self, entry, status)
							local content = {}
							append_lines(content, vim.inspect(entry.value))
							vim.api.nvim_buf_set_option(self.state.bufnr, "modifiable", true)
							vim.api.nvim_buf_set_lines(self.state.bufnr, 0, -1, false, content)
							vim.api.nvim_buf_set_option(self.state.bufnr, "modifiable", false)
							vim.api.nvim_buf_set_option(self.state.bufnr, "filetype", "lua")
							vim.api.nvim_win_set_option(self.state.winid, "wrap", true)
						end,
					}),
					attach_mappings = function(prompt_bufnr, map)
						local function open_selection()
							local selection = action_state.get_selected_entry()
							if not selection then
								return
							end
							local id = selection.value.id
							if type == "tenants" then
								on_close(prompt_bufnr)
								vim.cmd("SPISwitchTenant " .. id)
								M.cache = {}
								vim.schedule(function()
									pick_resource_type(extra_opts)
								end)
								return
							end

							on_close(prompt_bufnr)
							M.open_resource(type, id)
						end

						actions.select_default:replace(open_selection)

						map("i", "<BS>", function()
							if action_state.get_current_line() == "" then
								on_close(prompt_bufnr)
								vim.schedule(function()
									pick_resource_type(extra_opts)
								end)
							else
								vim.api.nvim_feedkeys(
									vim.api.nvim_replace_termcodes("<BS>", true, false, true),
									"n",
									true
								)
							end
						end)

						map("n", "<BS>", function()
							on_close(prompt_bufnr)
							vim.schedule(function()
								pick_resource_type(extra_opts)
							end)
						end)

						map("i", "<C-c>", function()
							on_close(prompt_bufnr)
						end)
						map("n", "q", function()
							on_close(prompt_bufnr)
						end)
						map("n", "<Esc>", function()
							on_close(prompt_bufnr)
						end)

						vim.api.nvim_buf_attach(prompt_bufnr, false, {
							on_detach = function()
								M.is_active = false
							end,
						})

						return true
					end,
				})
				:find()
		end)

		if not ok then
			M.is_active = false
		end
		return true
	end

	pick_resource_type = function(extra_opts)
		if M.is_active then
			return
		end
		local has_telescope, telescope = pcall(require, "telescope")
		if not has_telescope then
			return
		end
		M.is_active = true
		prefetch_all_resources()
		local pickers = require("telescope.pickers")
		local finders = require("telescope.finders")
		local conf = require("telescope.config").values
		local actions = require("telescope.actions")
		local action_state = require("telescope.actions.state")
		local previewers = require("telescope.previewers")

		local picker_opts = {
			sorting_strategy = "ascending",
		}
		if extra_opts and extra_opts.fullscreen then
			picker_opts.layout_strategy = "horizontal"
			picker_opts.layout_config = {
				width = 0.99,
				height = 0.99,
				prompt_position = "top",
				preview_width = 0.6,
			}
		else
			picker_opts.layout_config = { anchor = "N", height = 0.8, width = 0.8, prompt_position = "top" }
		end

		local function on_close(prompt_bufnr)
			M.is_active = false
			if prompt_bufnr then
				actions.close(prompt_bufnr)
			end
		end

		local ok, _ = pcall(function()
			pickers
				.new(picker_opts, {
					prompt_title = "SailPoint Resources",
					finder = finders.new_table({
						results = all_types,
						entry_maker = function(entry)
							return { value = entry, display = entry.name, ordinal = entry.name }
						end,
					}),
					sorter = conf.generic_sorter({}),
					previewer = previewers.new_buffer_previewer({
						define_preview = function(self, entry, status)
							local res_type = entry.value.id
							local bufnr = self.state.bufnr
							vim.api.nvim_win_set_option(self.state.winid, "wrap", true)
							if M.cache[res_type] then
								vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
								vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, M.cache[res_type])
								vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
							else
								vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
								vim.api.nvim_buf_set_lines(
									bufnr,
									0,
									-1,
									false,
									{ "Loading " .. entry.value.name .. "..." }
								)
								vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
								preview_timer:stop()
								preview_timer:start(
									50,
									100,
									vim.schedule_wrap(function()
										if M.cache[res_type] and vim.api.nvim_buf_is_valid(bufnr) then
											preview_timer:stop()
											vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
											vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, M.cache[res_type])
											vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
										end
									end)
								)
							end
						end,
					}),
					attach_mappings = function(prompt_bufnr, map)
						actions.select_default:replace(function()
							local selection = action_state.get_selected_entry()
							if not selection then
								return
							end
							local res_type = selection.value.id

							if res_type == "tenants" then
								local items, _ = safe_fetch_items("tenants")
								if not items or #items == 0 then
									on_close(prompt_bufnr)
									vim.schedule(function()
										add_tenant_wizard()
									end)
									return
								end
							end

							if
								res_type ~= "tenants"
								and M.cache[res_type]
								and M.cache[res_type][1]
								and M.cache[res_type][1]:find("No tenants")
							then
								print("Please add a tenant.")
								return
							end

							if M.cache[res_type] and M.cache[res_type][1] and M.cache[res_type][1]:find("Error") then
								M.cache[res_type] = nil
							end

							on_close(prompt_bufnr)
							vim.schedule(function()
								sailpoint_telescope(res_type, nil, extra_opts)
							end)
						end)

						map("i", "<C-c>", function()
							on_close(prompt_bufnr)
						end)
						map("n", "q", function()
							on_close(prompt_bufnr)
						end)
						map("n", "<Esc>", function()
							on_close(prompt_bufnr)
						end)

						vim.api.nvim_buf_attach(prompt_bufnr, false, {
							on_detach = function()
								M.is_active = false
							end,
						})

						return true
					end,
				})
				:find()
		end)

		if not ok then
			M.is_active = false
		end
	end

	vim.api.nvim_create_user_command("SPIInstall", function()
		local plugin_dir = debug.getinfo(1).source:sub(2):match("(.*)/lua/sailpoint/init.lua")
		if not plugin_dir then
			return
		end
		local cmd = "cd " .. plugin_dir .. "/rplugin/node/sailpoint && npm install"
		print("SailPoint: Installing Node dependencies...")
		vim.fn.jobstart(cmd, {
			on_exit = function(_, code)
				if code == 0 then
					print("SailPoint: Backend installed! Restart Neovim.")
				else
					print("SailPoint: Installation failed.")
				end
			end,
		})
	end, {})

	vim.api.nvim_create_user_command("SailPoint", function(opts)
		local args = opts.args or ""
		local arg = args:lower()
		if arg == "" then
			pick_resource_type()
		else
			sailpoint_telescope(arg)
		end
	end, { nargs = "?" })

	vim.api.nvim_create_user_command("SetSail", function()
		load_resource_types()
		M.setup_sidebar_buffer()
	end, {})

	vim.api.nvim_create_user_command("SailPointAdd", function(opts)
		local args = vim.split(opts.args or "", " ")
		local type = args[1] and args[1]:lower() or ""
		if type == "tenant" then
			add_tenant_wizard()
		elseif type ~= "" then
			vim.ui.input({ prompt = "New " .. type .. " name: " }, function(n)
				if n then
					vim.cmd("SPIAdd " .. type .. " " .. n)
				end
			end)
		else
			print("Usage: SailPointAdd <tenant|type>")
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointAggregate", function(opts)
		local args = vim.split(opts.args or "", " ")
		if not args[2] then
			vim.ui.input({ prompt = "ID: " }, function(v)
				if v then
					vim.cmd("SPIAggregate " .. args[1] .. " " .. v)
				end
			end)
		else
			vim.cmd("SPIAggregate " .. args[1] .. " " .. args[2])
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointDelete", function(opts)
		local args = vim.split(opts.args or "", " ")
		if args[1] == "tenant" then
			local target = args[2]
			if not target or target == "" then
				vim.ui.input({ prompt = "Tenant ID to remove: " }, function(t)
					if t then
						M.cache = {}
						vim.fn.SPIRemoveTenant(t)
					end
				end)
			else
				M.cache = {}
				vim.fn.SPIRemoveTenant(target)
			end
		else
			local target = args[1]
			if not target or target == "" then
				vim.ui.input({ prompt = "API Path to delete: " }, function(p)
					if p then
						vim.cmd("SPIDeleteResource " .. p)
					end
				end)
			else
				vim.cmd("SPIDeleteResource " .. target)
			end
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointConfig", function(opts)
		local args = vim.split(opts.args or "", " ")
		pcall(vim.cmd, "SPIConfig " .. (args[1] or "") .. " " .. (args[2] or ""))
	end, { nargs = "*" })

	local missing = check_dependencies()
	if #missing > 0 then
		vim.notify("SailPoint plugin missing dependencies: " .. table.concat(missing, ", "), vim.log.levels.WARN)
	end
end

return M
