local M = {}

M.cache = {}
M.is_active = false

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

function M.setup(opts)
	opts = opts or {}

	local all_types = {
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

	local tenants_cat = table.remove(all_types, 1)
	table.sort(all_types, function(a, b)
		return a.name:lower() < b.name:lower()
	end)
	table.insert(all_types, 1, tenants_cat)

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
							local tenant = vim.fn.SailPointGetActiveTenant()
							local version = (tenant and tenant.version) or "v3"
							if type == "sources" then
								vim.cmd("SPIGetSource " .. id)
							elseif type == "transforms" then
								vim.cmd("SPIGetTransform " .. id)
							elseif type == "roles" then
								vim.cmd("SPIGetRole " .. id)
							elseif type == "access-profiles" then
								vim.cmd("SPIGetAccessProfile " .. id)
							elseif type == "rules" then
								vim.cmd("SPIGetConnectorRule " .. id)
							elseif type == "workflows" then
								vim.cmd("SPIGetWorkflow " .. id)
							elseif type == "service-desk" then
								vim.cmd("SPIRaw /" .. version .. "/service-desk-integrations/" .. id)
							elseif type == "identity-profiles" then
								vim.cmd("SPIRaw /" .. version .. "/identity-profiles/" .. id)
							elseif type == "forms" then
								vim.fn.SailPointRawWithFallback(
									"/" .. version .. "/forms/" .. id,
									"/beta/forms/" .. id,
									"forms",
									id
								)
							elseif type == "search-attributes" then
								vim.fn.SailPointRawWithFallback(
									"/" .. version .. "/search-attribute-config",
									"/beta/search-attribute-config",
									"search-attributes",
									"config"
								)
							elseif type == "identity-attributes" then
								vim.fn.SailPointRawWithFallback(
									"/" .. version .. "/identity-attributes/" .. id,
									"/beta/identity-attributes/" .. id,
									"identity-attributes",
									id
								)
							elseif type == "apps" then
								vim.cmd("SPIRaw /" .. version .. "/source-apps/" .. id)
							elseif type == "identities" then
								vim.cmd("SPIRaw /" .. version .. "/identities/" .. id)
							elseif type == "campaigns" then
								vim.cmd("SPIRaw /" .. version .. "/campaigns/" .. id)
							else
								print("Not implemented.")
							end
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
					print("SailPoint: Installation succeeded! Restart Neovim.")
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

	vim.api.nvim_create_user_command("SetSail", function(opts)
		local arg = (opts.args or ""):lower()

		vim.defer_fn(function()
			if arg == "" then
				pick_resource_type({ fullscreen = true })
			else
				sailpoint_telescope(arg, nil, { fullscreen = true })
			end
		end, 0)
	end, { nargs = "?" })

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
