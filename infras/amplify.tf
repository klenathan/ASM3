resource "aws_amplify_app" "web" {
  name        = "${local.name}-web"
  description = "RMIT Society React web client"
  platform    = "WEB"

  # Route API calls through the hosted origin so session cookies remain first-party.
  custom_rule {
    source = "/api/<*>"
    target = "${local.api_origin}/api/<*>"
    status = "200"
  }

  # Preserve direct links to BrowserRouter routes without rewriting static assets.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|mjs|png|txt|svg|woff|woff2|ttf|map)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }
}

resource "aws_amplify_branch" "web" {
  app_id            = aws_amplify_app.web.id
  branch_name       = "production"
  stage             = "PRODUCTION"
  enable_auto_build = false
}
