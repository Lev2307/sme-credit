from django.contrib import admin

from .models import Agreement, Application, ApplicationDocument, ApplicationEvent, Decision, EnrichmentResult, InfoRequested

admin.site.register(Application)
admin.site.register(ApplicationDocument)
admin.site.register(ApplicationEvent)
admin.site.register(EnrichmentResult)
admin.site.register(Decision)
admin.site.register(InfoRequested)
admin.site.register(Agreement)
