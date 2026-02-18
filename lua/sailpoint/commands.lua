-- User command registration and interactive wizards
local config = require("sailpoint.config")
local utils = require("sailpoint.utils")

local M = {}

local function check_dependencies()
	local missing = {}
	if vim.fn.executable("node") == 0 then
		table.insert(missing, "node")
	end
	if vim.fn.executable("npm") == 0 then
		table.insert(missing, "npm")
	end
	return missing
end

-- Prompts for: name, tenant ID, client ID, secret, domain
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
						config.cache = {}
					end)
				end)
			end)
		end)
	end)
end

function M.register(opts)
	local toggle_sidebar = opts.toggle_sidebar
	local open_sidebar = opts.open_sidebar

	vim.api.nvim_create_user_command("SPIInstall", function()
		local plugin_dir = debug.getinfo(1).source:sub(2):match("(.*)/lua/sailpoint/commands.lua")
		if not plugin_dir then
			return
		end
		local cmd = "cd " .. plugin_dir .. "/rplugin/node/sailpoint && npm install"
		utils.notify_info("SailPoint: Installing Node dependencies...")
		vim.fn.jobstart(cmd, {
			on_exit = function(_, code)
				if code == 0 then
					utils.notify_info("SailPoint: Backend installed! Restart Neovim.")
				else
					utils.notify_error("SailPoint: Installation failed.")
				end
			end,
		})
	end, {})

	vim.api.nvim_create_user_command("SetSail", function()
		if toggle_sidebar then
			toggle_sidebar()
		elseif open_sidebar then
			open_sidebar()
		end
	end, { nargs = 0 })

	vim.api.nvim_create_user_command("SailPointAdd", function(command_opts)
		local args = vim.split(command_opts.args or "", " ")
		local type = args[1] and args[1]:lower() or ""
		if type == "tenant" then
			add_tenant_wizard()
		elseif type ~= "" then
			vim.ui.input({ prompt = "New " .. type .. " name: " }, function(n)
				if n then
					utils.run_user_command("SPIAdd", { type, n })
				end
			end)
		else
			utils.notify_warn("Usage: SailPointAdd <tenant|type>")
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointAggregate", function(command_opts)
		local args = vim.split(command_opts.args or "", " ")
		if not args[2] then
			vim.ui.input({ prompt = "ID: " }, function(v)
				if v then
					utils.run_user_command("SPIAggregate", { args[1], v })
				end
			end)
		else
			utils.run_user_command("SPIAggregate", { args[1], args[2] })
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointDelete", function(command_opts)
		local args = vim.split(command_opts.args or "", " ")
		if args[1] == "tenant" then
			local target = args[2]
			if not target or target == "" then
				vim.ui.input({ prompt = "Tenant ID to remove: " }, function(t)
					if t then
						config.cache = {}
						vim.fn.SPIRemoveTenant(t)
					end
				end)
			else
				config.cache = {}
				vim.fn.SPIRemoveTenant(target)
			end
		else
			local target = args[1]
			if not target or target == "" then
				vim.ui.input({ prompt = "API Path to delete: " }, function(p)
					if p then
						utils.run_user_command("SPIDeleteResource", { p })
					end
				end)
			else
				utils.run_user_command("SPIDeleteResource", { target })
			end
		end
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SailPointConfig", function(command_opts)
		local args = vim.split(command_opts.args or "", " ")
		pcall(utils.run_user_command, "SPIConfig", { args[1] or "", args[2] or "" })
	end, { nargs = "*" })

	vim.api.nvim_create_user_command("SPISearch", function(command_opts)
		local query = command_opts.args or ""
		if query ~= "" then
			utils.run_user_command("SPISearch", { query })
		end
	end, { nargs = "*" })

	local missing = check_dependencies()
	if #missing > 0 then
		vim.notify("SailPoint plugin missing dependencies: " .. table.concat(missing, ", "), vim.log.levels.WARN)
	end
end

return M
