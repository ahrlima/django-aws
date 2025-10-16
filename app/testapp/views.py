from django.http import HttpResponse


def hello_world(request):
    return HttpResponse('in the light', status=200)


def health_check(request):
    return HttpResponse('OK', status=200)
